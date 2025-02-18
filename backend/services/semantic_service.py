from config import DevelopmentConfig
import openai
import re

class SemanticService:
    def __init__(self):
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

    def identify_question_type(self, question, current_dataset='ppl_densit'):
        """Identify the type of question being asked using GPT"""
        try:
            metric_name = self.dataset_terms[current_dataset]['metric']
            
            system_prompt = """You are a geographic data analysis expert. Your task is to classify questions about geographic data into one of these categories:
            1. retrieve - Direct value retrieval (e.g., "What's the X of State Y?")
            2. compare - Value comparisons (e.g., "Which state has higher X, Y or Z?")
            3. find_extremum - Finding min/max (e.g., "Which state has highest/lowest X?")
            4. aggregate - Averages and related metrics (e.g., "What's the average X?")
            5. filter - Condition-based filtering (e.g., "Which states have X less than Y?")
            6. sort - Ordering and ranking (e.g., "What are top 3 states with highest X?")
            7. data_ranges - Finding ranges (e.g., "What's the range of X values?")
            8. cluster - Finding similar values (e.g., "Which states have similar X to Y?")
            9. is_pattern - Pattern existence (e.g., "Is there a pattern in the map?")
            10. describe_pattern - Pattern description (e.g., "Describe the pattern in the map")
            11. find_outliers - Finding outliers (e.g., "What states have high X despite low surroundings?")
            12. correlate - Relationship analysis (e.g., "Is there a relationship between X and Y?")
            13. others - Conceptual/invalid questions (e.g., "What is X?" or invalid queries)

            Respond with ONLY the category name, nothing else."""

            user_prompt = f"Classify this question about {metric_name}: {question}"

            openai.api_key = DevelopmentConfig.OPENAI_API_KEY
            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0,
                max_tokens=20
            )

            question_type = response.choices[0].message.content.strip().lower()
            print(f"Debug - Identified question type: {question_type}")
            return question_type

        except Exception as e:
            print(f"Error in identify_question_type: {str(e)}")
            return 'others'

    def extract_states(self, question):
        """Extract state names from questions using GPT"""
        try:
            system_prompt = """You are a geographic data expert. Extract US state names from the question.
            Return ONLY a comma-separated list of state names found, or 'none' if no states are mentioned.
            Example: "What's the population density of New York and California?" -> "New York, California"
            """

            openai.api_key = DevelopmentConfig.OPENAI_API_KEY
            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}
                ],
                temperature=0,
                max_tokens=50
            )

            result = response.choices[0].message.content.strip().lower()
            if result == 'none':
                return []
                
            states = [state.strip() for state in result.split(',')]
            print(f"Debug - Extracted states: {states}")
            return states

        except Exception as e:
            print(f"Error extracting states: {str(e)}")
            return []

    def get_valid_states(self):
        """Get list of valid state names"""
        return [
            "Alabama", "Alaska", "Arizona", "Arkansas", "California",
            "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
            "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
            "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
            "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
            "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
            "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
            "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
            "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
            "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
        ]

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