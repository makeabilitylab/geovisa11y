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
            # print(f"Debug - Identified question type: {question_type}")
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
        Check if question is out of scope for the current dataset using GPT
        Returns: bool - True if question should be handled by GPT directly
        """
        try:
            # Get the correct metric name from dataset_terms
            metric_name = self.dataset_terms[current_dataset]['metric']
            unit = self.dataset_terms[current_dataset]['unit']

            system_prompt = """You are an expert at analyzing geographic data questions.
            Determine if this question can be answered using the current dataset.
            
            Return 'true' if the question:
            1. Asks about a DIFFERENT metric than the current dataset
               Example: When viewing population density data:
               - "What's the income level in Texas?" -> true (different metric)
               - "What's the population density in Texas?" -> false (same metric)
               - "What's the population of Illinois?" -> false (different metric)
            2. Asks about geographic units not available in the dataset
               Example: 
               -"What's the population density of Seattle?" -> true (only state/county data available)
               -"What's the population density of the United States?" -> true (only state/county data available)
               -"What's the population density of the world?" -> true (only state/county data available)
               -"What's the population density of the Northeast region?" -> true (only state/county data available)
            3. Asks conceptual questions about geography or the metric
               Example: "Why do some areas have higher density?" -> true

            IMPORTANT: Return ONLY 'true' or 'false' as a single word.
            """

            user_prompt = f"""Question: {question}
            Current dataset information:
            - Metric: {metric_name}
            - Unit: {unit}
            - Geographic levels available: state and county only"""

            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )
            print(f"Out of scope check raw response: {response.choices[0].message.content.strip().lower()}")
            result = response.choices[0].message.content.strip().lower() == 'true'
            print(f"Out of scope check: {result}")
            return result

        except Exception as e:
            print(f"Error in out of scope check: {str(e)}")
            # Fallback to basic check
            question_lower = question.lower()
            # Check for non-dataset metrics
            # metric_terms = ['income', 'poverty', 'education', 'unemployment', 'gdp', 'crime']
            # if any(term in question_lower for term in metric_terms):
            #     return True
            # Check for non-supported geographic units
            geo_terms = ['region', 'city', 'town', 'metropolitan', 'urban', 'rural']
            if any(term in question_lower for term in geo_terms):
                return True
            # Check for conceptual questions
            concept_terms = ['why', 'how come', 'what causes', 'explain', 'theory', 'reason']
            return any(term in question_lower for term in concept_terms)

    def is_ambiguous_question(self, question, previous_answer=None, current_focus=None):
        """
        Check if a question is ambiguous and needs context resolution using GPT
        Returns: (is_ambiguous: bool, ambiguity_type: str, context_needed: dict)
        """
        try:
            system_prompt = """You are an expert at analyzing geographic questions for ambiguity.
            Analyze if the question contains any ambiguous "references" that require context to resolve.
            A question is ambiguous only in these specific cases:
            1. The input includes "here" (e.g., "What's the population density here?")
            2. The input includes "this/that state/county" without naming it (e.g., "What's the population of this state?")
            3. The input includes "it" referring to a location (e.g., "What does it look like?")

            Respond with ONLY a JSON string in this exact format:
            {"is_ambiguous": true/false, "ambiguity_type": "location_reference" or null, "needs_context": {"location": string or null, "type": "state" or "county" or null}}
            """

            # Simplified context normalization
            if isinstance(current_focus, dict) and current_focus.get('county'):
                location = f"{current_focus['county']} County, {current_focus['state']}"
                context_type = "county"
            else:
                location = current_focus.get('state') if isinstance(current_focus, dict) else current_focus
                context_type = "state"

            context = {
                "current_state": location,
                "type": context_type
            }

            user_prompt = f"Question: {question}\nContext: {context}"

            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )

            result = json.loads(response.choices[0].message.content.strip())
            print(f"Ambiguity check: {result}")
            
            # If ambiguous and we have context, provide it
            if result["is_ambiguous"] and location:
                result["needs_context"]["location"] = location
                result["needs_context"]["type"] = context_type

            return (
                result["is_ambiguous"],
                result["ambiguity_type"],
                result["needs_context"]
            )

        except Exception as e:
            print(f"Error in ambiguity check: {str(e)}")
            # Fallback to basic check
            if any(word in question.lower() for word in ['here', 'this state', 'that state', 'it']):
                return True, 'location_reference', {
                    'location': location,
                    'type': context_type
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
                model="gpt-4o-mini",
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

    def is_navigation_action(self, user_input):
        """
        Check if the input is a navigation action (e.g., "go to", "focus on", "zoom to", etc.)
        Returns (is_action, location_info) tuple where location_info can be state name or [city, coordinates]
        """
        try:
            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a pattern matcher for US location navigation commands.
                        Identify if the input is asking to navigate/focus/zoom to a specific US location.
                        Return exactly "None" if it's not a navigation command.
                        If it is a navigation command for a state, return a JSON object with "type": "state" and "name": state_name.
                        If it is a navigation command for a city, return a JSON object with "type": "city", "city", "state", and "coordinates".
                        
                        Examples:
                        "Take me to California" -> {"type": "state", "name": "California"}
                        "What is the population of Texas" -> "None"
                        "Zoom to NY!" -> {"type": "state", "name": "New York"}
                        "Focus on Seattle" -> {"type": "city", "city": "Seattle", "state": "Washington", "coordinates": [-122.3321, 47.6062]}
                        "Go to Miami please" -> {"type": "city", "city": "Miami", "state": "Florida", "coordinates": [-80.1918, 25.7617]}
                        """
                    },
                    {
                        "role": "user",
                        "content": user_input
                    }
                ],
                temperature=0,
                max_tokens=100
            )
            
            result = response.choices[0].message.content.strip()
            if result == "None":
                return False, None
            
            # Try to parse as JSON
            try:
                location_info = json.loads(result)
                if location_info["type"] == "city":
                    return True, ("city", {
                        "city": location_info["city"],
                        "state": location_info["state"],
                        "coordinates": location_info["coordinates"]
                    })
                else:  # state navigation
                    return True, ("state", location_info["name"])
            except json.JSONDecodeError:
                print(f"Error parsing JSON response: {result}")
                # Fall back to regex pattern
                action_match = re.match(r'^(?:focus\s+on|go\s+to)\s+(.+)$', user_input, re.IGNORECASE)
                if action_match:
                    return True, ("state", action_match.group(1).strip())
                return False, None

        except Exception as e:
            print(f"Error in is_navigation_action: {str(e)}")
            # Fall back to regex pattern if API fails
            action_match = re.match(r'^(?:focus\s+on|go\s+to)\s+(.+)$', user_input, re.IGNORECASE)
            if action_match:
                return True, ("state", action_match.group(1).strip())
            return False, None