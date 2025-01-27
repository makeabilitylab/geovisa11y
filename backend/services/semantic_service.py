from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import duckdb

class SemanticService:
    def __init__(self):
        # Initialize the sentence transformer model
        self.model = SentenceTransformer('all-mpnet-base-v2')
        
        # Initialize database connection
        self.con = duckdb.connect('database/spatial-db.db', read_only=True)
        
        # Define question types with example patterns
        self.question_types = {
            'state_value': {
                'phrases': [
                    "what is the population density of {state}",
                    "what's the population density in {state}",
                    "how many people per square mile in {state}",
                    "what is the value for {state}",
                    "tell me about {state}'s population density",
                    "what's the density of {state}",
                    "show me {state}'s density"
                ]
            },
            'state_comparison': {
                'phrases': [
                    "which state has higher population density, {state1} or {state2}",
                    "compare {state1} and {state2}",
                    "what's the difference between {state1} and {state2}",
                    "is {state1} higher than {state2}",
                    "which has more population density, {state1} or {state2}"
                ]
            },
            'extrema': {
                'phrases': [
                    "which state has the highest population density",
                    "which state has the lowest population density",
                    "what is the highest value",
                    "what is the lowest value",
                    "where is population density highest",
                    "where is population density lowest",
                    "what's the highest density",
                    "what's the lowest density"
                ]
            },
            'average': {
                'phrases': [
                    "what is the average population density",
                    "what's the mean population density",
                    "what's the average value",
                    "what is the typical value",
                    "what's the median population density",
                    "what's the average density",
                    "what's typical for this map"
                ]
            },
            'pattern_existence': {
                'phrases': [
                    "is there a pattern in the map",
                    "is there spatial autocorrelation",
                    "are values clustered",
                    "is there clustering in the map",
                    "do similar values cluster together",
                    "is there a spatial pattern",
                    "do you see any patterns"
                ]
            },
            'pattern_description': {
                'phrases': [
                    "describe the pattern in the map",
                    "where are the clusters",
                    "what does the pattern look like",
                    "describe the spatial distribution",
                    "where are the hot spots and cold spots",
                    "show me the clusters",
                    "what's the spatial pattern"
                ]
            }
        }
        
        # Pre-compute embeddings for each question type
        self.type_embeddings = {}
        for qtype, config in self.question_types.items():
            self.type_embeddings[qtype] = self.model.encode(config['phrases'])

    def get_valid_states(self):
        """Fetch list of valid state names from database"""
        try:
            query = "SELECT DISTINCT state_name FROM state ORDER BY state_name"
            result = self.con.execute(query).fetchall()
            return [row[0] for row in result]
        except Exception as e:
            print(f"Error fetching states from database: {str(e)}")
            return []

    def identify_question_type(self, question):
        """Identify the type of question being asked"""
        question_embedding = self.model.encode([question])[0]
        
        max_similarity = -1
        best_type = None
        
        # Check similarity with each question type
        for qtype, embeddings in self.type_embeddings.items():
            similarities = cosine_similarity([question_embedding], embeddings)[0]
            max_type_similarity = np.max(similarities)
            
            if max_type_similarity > max_similarity:
                max_similarity = max_type_similarity
                best_type = qtype
        
        # Only return a type if we're confident enough
        if max_similarity > 0.6:
            return best_type
            
        return None

    def extract_states(self, question):
        """Extract state names from comparison questions"""
        question = question.lower()
        states = []
        valid_states = self.get_valid_states()
        for state in valid_states:
            if state.lower() in question:
                states.append(state)
        return states

    def identify_dataset(self, question):
        """Identify the most relevant dataset for a given question"""
        # Encode the question
        question_embedding = self.model.encode([question])[0]
        
        # Calculate similarities with all datasets
        max_similarity = -1
        best_dataset = None
        
        for dataset, embeddings in self.type_embeddings.items():
            # Calculate cosine similarity with all phrases in the dataset
            similarities = cosine_similarity([question_embedding], embeddings)[0]
            max_dataset_similarity = np.max(similarities)
            
            if max_dataset_similarity > max_similarity:
                max_similarity = max_dataset_similarity
                best_dataset = dataset
        
        # Only return a dataset if the similarity is above a threshold
        if max_similarity > 0.6:  # Adjust threshold as needed
            return best_dataset
        return None

    def is_spatial_pattern_question(self, question):
        """Check if the question is about spatial patterns"""
        pattern_phrases = [
            "spatial pattern",
            "spatial distribution",
            "clustering pattern",
            "density pattern",
            "density distribution",
            "geographic pattern",
            "regional pattern"
        ]
        
        # Encode question and pattern phrases
        question_embedding = self.model.encode([question])[0]
        pattern_embeddings = self.model.encode(pattern_phrases)
        
        # Calculate similarities
        similarities = cosine_similarity([question_embedding], pattern_embeddings)[0]
        
        # Return True if any similarity is above threshold
        return np.max(similarities) > 0.7  # Adjust threshold as needed 

    def identify_pattern_question_type(self, question):
        """Identify if and what type of pattern question is being asked"""
        # First check if it's a value comparison question
        value_words = [
            "highest", "most", "largest", "greatest", "biggest",
            "lowest", "least", "smallest", "minimum", "minimal",
            "average", "mean", "median", "typical"
        ]
        if any(word in question.lower() for word in value_words):
            return None  # Not a pattern question

        # Check if it's asking about a specific geography
        try:
            state_query = question.lower().replace("what's", "what is").replace("whats", "what is")
            if "what is the" in state_query and "of" in state_query:
                state_part = state_query.split("of")[-1].strip()
                # Extract just the potential location name
                location_name = state_part.split()[0] if state_part.split() else ""
                if location_name:
                    return 'location_query'
        except Exception as e:
            print(f"Error checking location query: {str(e)}")
            pass

        question_embedding = self.model.encode([question])[0]
        
        max_similarity = -1
        question_type = None
        
        # Check similarity with both types of pattern questions
        for qtype, embeddings in self.type_embeddings.items():
            similarities = cosine_similarity([question_embedding], embeddings)[0]
            max_type_similarity = np.max(similarities)
            
            if max_type_similarity > max_similarity:
                max_similarity = max_type_similarity
                question_type = qtype
        
        # Use different thresholds for different question types
        if question_type == 'state_value' and max_similarity > 0.6:
            return 'state_value'
        elif question_type == 'state_comparison' and max_similarity > 0.6:
            return 'state_comparison'
        elif question_type == 'extrema' and max_similarity > 0.6:
            return 'extrema'
        elif question_type == 'average' and max_similarity > 0.6:
            return 'average'
        elif question_type == 'pattern_existence' and max_similarity > 0.6:
            return 'pattern_existence'
        elif question_type == 'pattern_description' and max_similarity > 0.6:
            return 'pattern_description'
        return None 