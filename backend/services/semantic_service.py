from config import DevelopmentConfig
import openai
import re
import json

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

    def is_out_of_scope(self, question, current_dataset):
        """
        Check if question is out of scope for the current dataset using GPT.
        Must be checked BEFORE ambiguity resolution.
        Returns: bool - True if question should be handled by GPT directly
        """
        try:
            current_metric = self.dataset_terms[current_dataset]['metric']
            current_unit = self.dataset_terms[current_dataset]['unit']

            system_prompt = """You are an expert at analyzing geographic data questions.
            Determine if this question can be answered using the current dataset.
            
            Send to GPT (return true) if the question:
            1. Asks about a DIFFERENT metric than the current dataset
               Example: When viewing population density data:
               - "What's the income level in Texas?" -> true (different metric)
               - "What's the population density in Texas?" -> false (same metric)
            2. Asks about geographic units not available in the dataset
               Example: "How do cities compare?" -> true (only state/county data available)
            3. Asks conceptual questions about geography or the metric
               Example: "Why do some areas have higher density?" -> true

            Important: Check the metric FIRST, before considering location references.
            - "What's the income level here?" -> true (different metric, ignore the "here")
            - "What's the population density here?" -> false (correct metric, location can be resolved)

            Return ONLY true or false.
            """

            user_prompt = f"""Question: {question}
            Current dataset information:
            - Metric: {current_metric}
            - Unit: {current_unit}
            - Geographic levels available: state and county only"""

            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )

            result = response.choices[0].message.content.strip().lower() == 'true'
            return result

        except Exception as e:
            print(f"Error in out of scope check: {str(e)}")
            # Fallback to basic check if API fails
            question_lower = question.lower()
            # Check for non-dataset metrics first
            metric_terms = ['income', 'poverty', 'education', 'unemployment', 'gdp', 'crime']
            if any(term in question_lower for term in metric_terms):
                return True
            # Then check for non-supported geographic units
            geo_terms = ['region', 'city', 'town', 'metropolitan', 'urban', 'rural']
            if any(term in question_lower for term in geo_terms):
                return True
            # Finally check for conceptual questions
            concept_terms = ['why', 'how come', 'what causes', 'explain', 'theory', 'reason']
            return any(term in question_lower for term in concept_terms)

    def is_ambiguous_question(self, question, previous_answer=None, current_focus=None):
        """
        Check if a question is ambiguous and needs context resolution using GPT
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
# Sending ambiguity check with: Objectcurrent_focus: {state: Array(1), full: Array(1)}previous_answer: "Washington has 115.69 people per square mile."question: "Go to Oregon"raw_county: nullraw_state: ['Washington'][[Prototype]]: Object
# Chatbot.js:307 Ambiguity response: 
        try:
            system_prompt = """You are an expert at analyzing geographic questions for ambiguity.
            Analyze if the question contains any ambiguous "references" that require context to resolve.
            A question is ambiguous only in these specific cases:
            1. The input includes "here" (e.g., "What's the population density here?")
            2. The input includes "this/that state/county" without naming it (e.g., "What's the population of this state?")
            3. The input includes "it" referring to a location (e.g., "What does it look like?")

            Return a JSON object with this structure:
            {
                "is_ambiguous": true/false,
                "ambiguity_type": "location_reference" or null,
                "needs_context": {
                    "location": string or null,
                    "type": "state" or "county" or null
                }
            }
            """

            context = {
                "current_state": current_state,
                "current_county": current_county
            }

            user_prompt = f"Question: {question}\nContext: {context}"

            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0,
                response_format={ "type": "json" }
            )

            result = json.loads(response.choices[0].message.content)
            
            return (
                result["is_ambiguous"],
                result["ambiguity_type"],
                result["needs_context"]
            )

        except Exception as e:
            print(f"Error in ambiguity check: {str(e)}")
            # Fallback to basic location reference check if API fails
            if current_state or current_county:
                return True, 'location_reference', {
                    'location': current_county or current_state,
                    'type': 'county' if current_county else 'state'
                }
            return False, None, None

    def resolve_ambiguous_question(self, question, ambiguity_type, context):
        """
        Resolve ambiguous questions using provided context and GPT
        Returns: resolved question or None if can't resolve
        """
        if not context or ambiguity_type != 'location_reference':
            return None

        try:
            system_prompt = """You are an expert at resolving ambiguous geographic questions.
            Given a question with ambiguous references and the context, rewrite the question 
            to be explicit and unambiguous. Replace pronouns and location references with 
            the specific location names.

            Example:
            Question: "What's the population density here?"
            Context: {"location": "California", "type": "state"}
            Resolved: "What's the population density in California?"
            """

            user_prompt = f"Question: {question}\nContext: {context}"

            response = openai.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )

            resolved_question = response.choices[0].message.content.strip()
            return resolved_question

        except Exception as e:
            print(f"Error resolving ambiguous question: {str(e)}")
            return None