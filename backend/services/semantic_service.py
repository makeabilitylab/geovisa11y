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

        self.ambiguous_patterns = {
            'that_state': r'(?:that|the|this)\s+state',
            'here': r'\b(?:here|in this state|in this county)\b',
            'this_state_county': r'(?:this|the current)\s+(?:state|county)',
            'it': r'\bit\b',
            'outliers_pattern': r'(?:pattern|distribution)\s+(?:of|in|among)\s+(?:the\s+)?outliers'
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
            8. cluster - Finding similar values (e.g., "Which states have similar {values} to {state}?, Which states have {values} close to {state}?")
            9. is_pattern - Pattern existence (e.g., "Is there a pattern in the map?")
            10. describe_pattern - Pattern description (e.g., "Describe the pattern in the map")
            11. find_outliers - Finding outliers (e.g., "What states have high X despite low surroundings?")
            12. correlate - Relationship analysis (e.g., "Is there a relationship between X and Y?")
            13. describe_shape - Shape description (e.g., "Can you describe the shape of X?")
            14. others - Conceptual/invalid questions (e.g., "What is X?" or invalid queries)

            Respond with ONLY the category name, nothing else."""

            user_prompt = f"Classify this question about {metric_name}: {question}"

            openai.api_key = DevelopmentConfig.OPENAI_API_KEY
            response = openai.chat.completions.create(
                model="gpt-4o-mini",
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
                model="gpt-4o-mini",
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

    def is_ambiguous_question(self, question, previous_answer=None, current_focus=None):
        """
        Check if a question is ambiguous and needs context resolution
        Returns: (is_ambiguous: bool, ambiguity_type: str, context_needed: dict)
        """
        # Normalize current_focus to handle different input formats
        current_county = None
        current_state = None

        if current_focus:
            if isinstance(current_focus, dict):
                current_state = current_focus.get('state')
                if 'county' in current_focus:
                    current_county = current_focus['county']
            elif isinstance(current_focus, list):
                current_focus = current_focus[0] if current_focus else None
                if isinstance(current_focus, str):
                    if ',' in current_focus:
                        parts = current_focus.split(',')
                        current_county = parts[0].strip()
                        current_state = parts[1].strip()
                    elif ' County' in current_focus:
                        current_county = current_focus
                    else:
                        current_state = current_focus
            elif isinstance(current_focus, str):
                if ',' in current_focus:
                    parts = current_focus.split(',')
                    current_county = parts[0].strip()
                    current_state = parts[1].strip()
                elif ' County' in current_focus:
                    current_county = current_focus
                else:
                    current_state = current_focus

        question = question.lower()
        
        # Case 1: Reference to "that state"
        # if re.search(self.ambiguous_patterns['that_state'], question):
        #     if previous_answer:
        #         # Extract state name from previous answer
        #         state_match = re.search(r'(?i)(?:in|for|of|is)\s+([A-Za-z\s]+?)(?:\s+(?:has|with|state|is|shows|and|,|\.))', previous_answer)
        #         if state_match:
        #             return True, 'that_state', {'state': state_match.group(1).strip()}
        #     return True, 'that_state', None

        # Case 2: Reference to "here" or "this state/county"
        if re.search(self.ambiguous_patterns['here'], question) or re.search(self.ambiguous_patterns['this_state_county'], question):
            if current_county:
                return True, 'location_reference', {'location': current_county, 'type': 'county'}
            elif current_state:
                return True, 'location_reference', {'location': current_state, 'type': 'state'}
            return True, 'location_reference', None

        # Case 3: Check for "it" references
        if re.search(self.ambiguous_patterns['it'], question):
            try:
                system_prompt = """You are an expert at analyzing geographic questions. 
                Determine if the word "it" in the question refers to a geographic location (state/county).
                Return ONLY "yes" or "no".
                Examples:
                - "What does it look like?" (when asking about a state) -> "yes"
                - "How big is it?" (when asking about a state) -> "yes"
                - "Why is it important?" (when asking about a concept) -> "no"
                """

                user_prompt = f"Context: Currently discussing the state of {current_state if current_state else 'unknown'}\nQuestion: {question}\nDoes 'it' refer to the state?"

                response = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0,
                    max_tokens=10
                )

                is_location_reference = response.choices[0].message.content.strip().lower() == "yes"
                
                if is_location_reference:
                    if current_county:
                        return True, 'location_reference', {'location': current_county, 'type': 'county'}
                    elif current_state:
                        return True, 'location_reference', {'location': current_state, 'type': 'state'}
                    return True, 'location_reference', None

            except Exception as e:
                print(f"Error checking 'it' reference: {str(e)}")
                # Fall back to basic pattern matching if API fails
                if current_state or current_county:
                    return True, 'location_reference', {
                        'location': current_county or current_state,
                        'type': 'county' if current_county else 'state'
                    }

        # Case 4: Reference to outliers pattern
        if re.search(self.ambiguous_patterns['outliers_pattern'], question):
            if previous_answer and 'outlier' in previous_answer.lower():
                # Extract states mentioned as outliers
                states = self.extract_states(previous_answer)
                if states:
                    return True, 'outliers', {'states': states}
            return True, 'outliers', None
        
        return False, None, None

    def resolve_ambiguous_question(self, question, ambiguity_type, context):
        """
        Resolve ambiguous questions using provided context
        Returns: resolved question or None if can't resolve
        """
        if not context:
            return None

        question = question.lower()
        
        if ambiguity_type == 'that_state':
            state_name = context.get('state')
            if state_name:
                return re.sub(
                    self.ambiguous_patterns['that_state'], 
                    state_name, 
                    question, 
                    flags=re.IGNORECASE
                )

        elif ambiguity_type == 'location_reference':
            location = context.get('location')
            location_type = context.get('type')
            if not location:
                return None

            # Replace "here" patterns
            question = re.sub(
                self.ambiguous_patterns['here'],
                f"in {location}",
                question,
                flags=re.IGNORECASE
            )

            # Replace "this state/county" patterns
            question = re.sub(
                self.ambiguous_patterns['this_state_county'],
                location,
                question,
                flags=re.IGNORECASE
            )

            # Replace "it" with appropriate reference
            if re.search(self.ambiguous_patterns['it'], question):
                if location_type == 'state':
                    question = re.sub(
                        self.ambiguous_patterns['it'],
                        f"the state of {location}",
                        question,
                        flags=re.IGNORECASE
                    )
                else:
                    question = re.sub(
                        self.ambiguous_patterns['it'],
                        location,
                        question,
                        flags=re.IGNORECASE
                    )

            return question

        elif ambiguity_type == 'outliers':
            states = context.get('states', [])
            if states:
                states_str = ', '.join(states)
                return f"Describe the pattern of outlier states: {states_str}"

        return None

    def is_different_metric(self, question, current_metric):
        """Check if question is asking about a different metric than what's currently displayed"""
        # Get terms for the current dataset's metric
        current_metric_terms = []
        for dataset_info in self.dataset_terms.values():
            if dataset_info['metric'] == current_metric:
                # Add metric name and unit as terms
                current_metric_terms.extend(dataset_info['metric'].lower().split())
                current_metric_terms.extend(dataset_info['unit'].lower().split())
                break
        
        # Check if question contains any terms from current metric
        question_lower = question.lower()
        question_words = question_lower.split()
        
        # If none of the current metric terms are in the question, it might be about a different metric
        metric_related = any(term in question_words for term in current_metric_terms)
        return not metric_related