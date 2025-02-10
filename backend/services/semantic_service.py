from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import duckdb
import re

class SemanticService:
    def __init__(self):
        # Initialize the sentence transformer model
        self.model = SentenceTransformer('all-mpnet-base-v2')
        
        # Initialize database connection
        self.con = duckdb.connect('database/spatial-db.db', read_only=True)
        
        # Define dataset-specific terms
        self.dataset_terms = {
            'ppl_densit': {
                'metric': 'population density',
                'unit': 'people per square mile'
            },
            'walk_to_wo': {
                'metric': 'walking to work percentage',
                'unit': 'percent'
            },
            'transit_to': {
                'metric': 'public transit usage',
                'unit': 'percent'
            }
        }
        
        # Define question types with example patterns
        self.question_types = {
            # 'state_value': {
            'retrieve' : {
                'phrases': [
                    "what is the {metric} of {state}",
                    "what's the {metric} in {state}",
                    "how many {unit} in {state}",
                    "what is the value for {state}",
                    "tell me about {state}'s {metric}",
                    "what's the {metric} of {state}",
                    "show me {state}'s {metric}"
                ]
            },
            # 'state_comparison': {
            'compare' : {
                'phrases': [
                    "which state has higher {metric}, {state1} or {state2}",
                    "compare {state1} and {state2}",
                    "what's the difference between {state1} and {state2}",
                    "is {state1} higher than {state2}",
                    "which has more {metric}, {state1} or {state2}",
                    "which is greater, {state1} or {state2}",
                    "how do {state1} and {state2} compare"
                ]
            },
            'extrema': {
                'phrases': [
                    "which state has the highest {metric}",
                    "which state has the lowest {metric}",
                    "what is the highest value",
                    "what is the lowest value",
                    "where is {metric} highest",
                    "where is {metric} lowest",
                    "what's the highest {metric}",
                    "what's the lowest {metric}",
                    "which state has most {metric}",
                    "which state has least {metric}"
                ]
            },
            'average': {
                'phrases': [
                    "what is the average {metric}",
                    "what's the mean {metric}",
                    "what's the average value",
                    "what is the typical value",
                    "what's the median {metric}",
                    "what's typical for this map",
                    "what's the typical {metric}",
                    "what's the overall {metric}"
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
                    "do you see any patterns",
                    "are there regional patterns",
                    "is there geographic clustering"
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
                    "what's the spatial pattern",
                    "describe the regional differences",
                    "where are the high and low areas"
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

    def get_embeddings_for_dataset(self, dataset):
        """Generate embeddings for phrases with dataset-specific terms"""
        embeddings = {}
        terms = self.dataset_terms[dataset]
        valid_states = self.get_valid_states()
        
        for qtype, config in self.question_types.items():
            concrete_phrases = []
            for phrase in config['phrases']:
                # Replace metric and unit placeholders
                base_phrase = phrase.replace('{metric}', terms['metric'])
                base_phrase = base_phrase.replace('{unit}', terms['unit'])
                
                # For state-specific questions, create variations with actual state names
                if '{state}' in base_phrase:
                    for state in valid_states:
                        concrete_phrase = base_phrase.replace('{state}', state)
                        concrete_phrases.append(concrete_phrase)
                else:
                    concrete_phrases.append(base_phrase)
            
            embeddings[qtype] = self.model.encode(concrete_phrases)
            
        return embeddings

    def identify_question_type(self, question, current_dataset='ppl_densit'):
        """Identify the type of question being asked"""
        # First check for conceptual questions
        conceptual_patterns = [
            r'^what is .+\?*$',
            r'^what\'s .+\?*$',
            r'^what does .+ mean\?*$',
            r'^what do you mean by .+\?*$',
            r'^explain .+\?*$',
            r'^tell me about .+\?*$',
            r'^define .+\?*$'
        ]
        
        question_lower = question.lower().strip()
        # Check if it's a conceptual question without specific state or value
        if any(re.match(pattern.lower(), question_lower) for pattern in conceptual_patterns):
            # Make sure it doesn't contain state names or specific values
            if not any(state.lower() in question_lower for state in self.get_valid_states()):
                if not any(word in question_lower for word in ['highest', 'lowest', 'average', 'pattern']):
                    return None  # Return None to fall back to GPT for conceptual questions
        
        # First check for explicit comparison patterns
        if " or " in question.lower() and any(word in question.lower() for word in ["higher", "greater", "more", "compare"]):
            return 'state_comparison'
            
        question_embedding = self.model.encode([question])[0]
        print(f"\nDebug - Question for type identification: {question}")
        
        # Get dataset-specific embeddings
        type_embeddings = self.get_embeddings_for_dataset(current_dataset)
        
        max_similarity = -1
        best_type = None
        
        # Check similarity with each question type
        for qtype, embeddings in type_embeddings.items():
            similarities = cosine_similarity([question_embedding], embeddings)[0]
            max_type_similarity = np.max(similarities)
            print(f"Debug - {qtype} similarity: {max_type_similarity:.3f}")
            
            if max_type_similarity > max_similarity:
                max_similarity = max_type_similarity
                best_type = qtype
                print(f"Debug - New best type: {best_type} with similarity {max_similarity:.3f}")
        
        # Only return a type if we're confident enough
        if max_similarity > 0.6:
            print(f"Debug - Final question type: {best_type} (similarity: {max_similarity:.3f})")
            return best_type
            
        print("Debug - No type matched with sufficient confidence")
        return None

    def extract_states(self, question):
        """Extract state names from comparison questions"""
        question = question.lower()
        print(f"\nDebug - Processing question: {question}")
        states = []
        valid_states = self.get_valid_states()
        
        # For comparison questions, look for specific patterns
        if any(word in question.lower() for word in ["compare", "higher", "lower", "between"]):
            print("Debug - Detected comparison question")
            # Look for "X or Y" pattern
            if " or " in question:
                print("Debug - Found 'or' pattern")
                parts = [p.strip() for p in question.split(" or ")]
                print(f"Debug - Split parts: {parts}")
                # Get the part before the first "or" and the part after the last "or"
                before_or = parts[0]
                after_or = parts[-1]
                print(f"Debug - Before 'or': {before_or}")
                print(f"Debug - After 'or': {after_or}")
                
                # Find states in each part
                for state in valid_states:
                    state_lower = state.lower()
                    if state_lower in before_or:
                        print(f"Debug - Found state in first part: {state}")
                        states.append(state)
                        break
                
                for state in valid_states:
                    state_lower = state.lower()
                    if state_lower in after_or and state not in states:
                        print(f"Debug - Found state in second part: {state}")
                        states.append(state)
                        break
            else:
                print("Debug - No 'or' pattern found, using regular extraction")
                for state in valid_states:
                    if state.lower() in question:
                        states.append(state)
        else:
            print("Debug - Not a comparison question")
            for state in valid_states:
                if state.lower() in question:
                    states.append(state)
        
        print(f"Debug - Final extracted states: {states}")
        return states[:2]

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
        # if question_type == 'state_value' and max_similarity > 0.6:
        if question_type == 'retrieve' and max_similarity > 0.6:
            # return 'state_value'
            return 'retrieve'
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