from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

class SemanticService:
    def __init__(self):
        # Initialize the sentence transformer model
        self.model = SentenceTransformer('multi-qa-MiniLM-L6-dot-v1')
        
        # Define dataset configurations
        self.dataset_configs = {
            'ppl_densit': {
                'name': 'Population Density',
                'phrases': [
                    "what is the population density",
                    "compare population density",
                    "which state has higher population density",
                    "show population density pattern",
                    "analyze population density distribution"
                ]
            },
            'walk_to_wo': {
                'name': 'Walking to Work',
                'phrases': [
                    "what percentage walk to work",
                    "compare walking to work rates",
                    "which state has higher walking percentage",
                    "show walking to work pattern",
                    "analyze walking commute distribution"
                ]
            },
            'transit_to': {
                'name': 'Public Transit to Work',
                'phrases': [
                    "what percentage use public transit",
                    "compare public transit usage",
                    "which state has higher transit usage",
                    "show public transit pattern",
                    "analyze transit usage distribution"
                ]
            }
        }
        
        # Pre-compute embeddings for all phrases
        self.dataset_embeddings = {}
        for dataset, config in self.dataset_configs.items():
            embeddings = self.model.encode(config['phrases'])
            self.dataset_embeddings[dataset] = embeddings

        # Update pattern-related configurations with more distinct categories
        self.pattern_questions = {
            'yes_no': {
                'phrases': [
                    "is there a pattern",
                    "is there a spatial pattern",
                    "do you see a pattern",
                    "can you see a pattern",
                    "does a pattern exist",
                    "is there clustering",
                    "is the data clustered",
                    "is there spatial autocorrelation",
                    "are values clustered",
                    "is there a geographic pattern"
                ]
            },
            'description': {
                'phrases': [
                    "describe the clusters",
                    "describe the spatial pattern",
                    "what are the clusters",
                    "what does the pattern look like",
                    "tell me about the clusters",
                    "explain the spatial pattern",
                    "show me the clusters",
                    "what are the hot spots",
                    "where are the clusters",
                    "describe the distribution"
                ]
            }
        }
        
        # Pre-compute embeddings for pattern questions
        self.pattern_embeddings = {
            'yes_no': self.model.encode(self.pattern_questions['yes_no']['phrases']),
            'description': self.model.encode(self.pattern_questions['description']['phrases'])
        }

    def identify_dataset(self, question):
        """Identify the most relevant dataset for a given question"""
        # Encode the question
        question_embedding = self.model.encode([question])[0]
        
        # Calculate similarities with all datasets
        max_similarity = -1
        best_dataset = None
        
        for dataset, embeddings in self.dataset_embeddings.items():
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
        question_embedding = self.model.encode([question])[0]
        
        # Debug prints
        print(f"\nAnalyzing question: {question}")
        
        max_similarity = -1
        question_type = None
        
        # Check similarity with both types of pattern questions
        for qtype, embeddings in self.pattern_embeddings.items():
            similarities = cosine_similarity([question_embedding], embeddings)[0]
            max_type_similarity = np.max(similarities)
            print(f"Max similarity for {qtype}: {max_type_similarity}")
            
            if max_type_similarity > max_similarity:
                max_similarity = max_type_similarity
                question_type = qtype
        
        print(f"Final max similarity: {max_similarity}")
        print(f"Selected type: {question_type}")
        
        # Use a lower threshold for yes/no questions to catch more variations
        if question_type == 'yes_no' and max_similarity > 0.4:
            return 'yes_no'
        # Use a higher threshold for description questions to be more precise
        elif question_type == 'description' and max_similarity > 0.5:
            return 'description'
        return None 