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
            'pct_tot_co': {
                'metric': 'underserved population percentage',
                'unit': 'percent'
            },
            'pct_no_bb_': {
                'metric': 'percentage of people lacking broadband and computer access',
                'unit': 'percent'
            },
            'gas': {
                'metric': 'number of households with gas heating',
                'unit': 'count'
            },
            'electricit': {
                'metric': 'number of households with electric heating',
                'unit': 'count'
            },
            'oil': {
                'metric': 'number of households with oil heating',
                'unit': 'count'
            },
            'pct_gas': {
                'metric': 'percentage of households with gas heating',
                'unit': 'percent'
            },
            'pct_electr': {
                'metric': 'percentage of households with electric heating',
                'unit': 'percent'
            },
            'pct_oil': {
                'metric': 'percentage of households with oil heating',
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
            9. get_pattern - Pattern analysis (e.g., "Is there a pattern in the map?", "Can you describe the pattern?")
            10. find_outliers - Finding outliers (e.g., "What states have high X despite low surroundings?")
            11. correlate - Relationship analysis (e.g., "Is there a relationship between X and Y?")
            12. describe_shape - Shape description (e.g., "Can you describe the shape of X?")
            13. urban_rural_comparison - Comparing urban vs rural areas (e.g., "Is there a difference between urban and rural counties regarding their predominant heating fuels?")
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

    def is_out_of_scope(self, question, current_dataset, available_datasets=None):
        """
        Check if question is out of scope for the current dataset and available datasets using GPT
        Returns: 
            - If no available_datasets provided: bool - True if question should be handled by GPT directly
            - If available_datasets provided: (bool, str) - (is_out_of_scope, matching_dataset or None)
        """
        try:
            # Get the correct metric name from dataset_terms
            metric_name = self.dataset_terms[current_dataset]['metric']
            unit = self.dataset_terms[current_dataset]['unit']

            # First, check if the question is about geographic units not available in the dataset
            # This applies regardless of whether we're checking against available_datasets or not
            geo_scope_prompt = """You are an expert at analyzing geographic data questions.
            Determine if this question asks about geographic units that are NOT available in the dataset.
            
            The dataset ONLY contains data at the state and county levels.
            
            Return 'true' if the question asks about:
            - Cities or towns
            - Regions (Northeast, Midwest, South, West, etc.)
            - The entire United States as a whole
            - The world or other countries
            - Census tracts, zip codes, or other sub-county areas
            - Any other geographic unit that is NOT a state or county
            
            Examples:
            - "What's the population density of Seattle?" -> true (city)
            - "Which region of the United States has the highest population density?" -> true (region)
            - "What's the population density of the United States?" -> true (country as a whole)
            - "What's the population density of the Northeast region?" -> true (region)
            - "What's the population density of Texas?" -> false (state)
            - "What's the population density of Harris County?" -> false (county)
            
            IMPORTANT: Return ONLY 'true' or 'false' as a single word.
            """

            geo_user_prompt = f"Question: {question}"

            geo_response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": geo_scope_prompt},
                    {"role": "user", "content": geo_user_prompt}
                ],
                temperature=0
            )
            
            geo_out_of_scope = geo_response.choices[0].message.content.strip().lower() == 'true'
            print(f"Geographic scope check: {geo_out_of_scope}")
            
            # If the question is about geographic units not available, it's out of scope
            if geo_out_of_scope:
                return True if available_datasets is None else (True, None)

            # If we have available_datasets, check if the question matches any of them
            if available_datasets:
                # Replace 'electricity' with 'electricit' in available_datasets if present
                if 'electricity' in available_datasets:
                    available_datasets = [ds if ds != 'electricity' else 'electricit' for ds in available_datasets]
                
                # Create a list of all available metrics for the prompt
                available_metrics = [f"{self.dataset_terms[ds]['metric']} ({ds})" for ds in available_datasets]
                metrics_list = ", ".join(available_metrics)
                
                system_prompt = f"""You are an expert at analyzing geographic data questions.
                Determine which dataset would best answer this question.
                
                Available datasets:
                {metrics_list}

                
                IMPORTANT RULES:
                1. For questions about population density, return 'ppl_densit'
                2. For questions about gas heating COUNTS or NUMBERS, return 'gas'
                3. For questions about electric/electricity heating COUNTS or NUMBERS, return 'electricit'
                4. For questions about oil heating COUNTS or NUMBERS, return 'oil'
                5. For questions about PERCENTAGES or PROPORTIONS of households using gas heating, return 'pct_gas'
                6. For questions about PERCENTAGES or PROPORTIONS of households using electric/electricity heating, return 'pct_electr'
                7. For questions about PERCENTAGES or PROPORTIONS of households using oil heating, return 'pct_oil'
                8. For questions about underserved populations, return 'pct_tot_co'
                9. For questions about people lacking broadband or computer access, return 'pct_no_bb_'
                
                CRITICAL DISTINCTION:
                - If the question asks about "how many households" use a heating type, use the COUNT datasets (gas, electricit, oil)
                - If the question asks about "what percentage" or "what proportion" of households use a heating type, use the PERCENTAGE datasets (pct_gas, pct_electr, pct_oil)
                
                Return the dataset code in parentheses that best matches the question, or 'none' if the question:
                1. Asks about a DIFFERENT metric than any available dataset
                2. Asks conceptual questions about geography or metrics
                
                IMPORTANT: Return ONLY the dataset code or 'none' as a single word.
                """

                user_prompt = f"Question: {question}"

                response = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0
                )
                result = response.choices[0].message.content.strip().lower()
                print(f"Dataset match check: {result}")
                
                # Clean up the result - remove any parentheses or extra characters
                result = result.strip('()')
                result = result.strip()
                
                if result != 'none' and result in available_datasets:
                    # Question matches an available dataset
                    return False, result
                else:
                    # Question doesn't match any available dataset
                    return True, None
            
            # Original behavior when no available_datasets is provided
            system_prompt = """You are an expert at analyzing geographic data questions.
            Determine if this question can be answered using the current dataset.
            
            Return 'true' if the question:
            1. Asks about a DIFFERENT metric than the current dataset
               Example: When viewing population density data:
               - "What's the income level in Texas?" -> true (different metric)
               - "What's the population density in Texas?" -> false (same metric)
               - "What's the population of Illinois?" -> true (different metric, population and population density are different metrics)
            2. Asks conceptual questions about geography or the metric
               Example: "Why do some areas have higher density?" -> true

            IMPORTANT: Return ONLY 'true' or 'false' as a single word.
            """

            user_prompt = f"""Question: {question}
            Current dataset information:
            - Metric: {metric_name}
            - Unit: {unit}"""

            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )
            result = response.choices[0].message.content.strip().lower() == 'true'
            print(f"Metric match check: {result}")
            return result

        except Exception as e:
            print(f"Error in out_of_scope check: {str(e)}")
            return False if available_datasets is None else (False, None)  # Default to keeping the question in scope if there's an error

    def is_ambiguous_question(self, question, previous_answer=None, current_focus=None, conversation_history=None):
        """
        Check if a question is ambiguous and needs context resolution using GPT
        Returns: (is_ambiguous: bool, ambiguity_type: str, context_needed: dict)
        """
        try:
            system_prompt = """You are an expert at analyzing geographic questions for ambiguity.
            Analyze if the question contains any ambiguous "references" that require context to resolve.
            
            There are two types of ambiguity:
            
            1. "location_reference" - when the location is ambiguous:
               - The input includes "here" (e.g., "What's the population density here?")
               - The input includes "it/its" referring to a location (e.g., "What does it look like?", "What are its neighbors?")
               - The input includes "this/that state/county" without naming it (e.g., "What's the population of this state?")
               - The input includes "the biggest/second largest city" without naming the state context (e.g., "What's the biggest city?")
            
            2. "subject_reference" - when the subject is ambiguous:
               - The input refers to a previous question's subject without specifying it (e.g., "What about Illinois?")
               - The input uses comparative terms without clear reference (e.g., "How does it compare to California?")
               - The input uses ordinal references without context (e.g., "What's the third largest?")
            
            A question can have both types of ambiguity simultaneously.
            
            Respond with ONLY a JSON string in this exact format:
            {
                "is_ambiguous": true/false,
                "ambiguity_type": "location_reference" or "subject_reference" or "both" or null,
                "location_context": {
                    "location": string or null,
                    "type": "state" or "county" or "city" or null
                },
                "subject_context": string or null
            }
            """

            # Simplified context normalization
            if isinstance(current_focus, dict) and current_focus.get('county'):
                # This is the key fix - properly format county context
                county_name = current_focus['county']
                state_name = current_focus['state']
                
                # Handle array input for state
                if isinstance(state_name, list) and len(state_name) > 0:
                    state_name = state_name[0]
                
                location = f"{county_name} County, {state_name}"
                context_type = "county"
            elif isinstance(current_focus, dict) and current_focus.get('city'):
                location = f"{current_focus['city']}, {current_focus['state']}"
                context_type = "city"
            else:
                location = current_focus.get('state') if isinstance(current_focus, dict) else current_focus
                context_type = "state"

            # print(f"Normalized location: {location}, type: {context_type}")

            # Format conversation history for context
            conversation_context = ""
            if conversation_history and len(conversation_history) > 0:
                # Take up to last 3 exchanges for context
                recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
                conversation_context = "\n".join([f"{'User' if i % 2 == 0 else 'Assistant'}: {msg}" for i, msg in enumerate(recent_history)])

            context = {
                "current_location": location,
                "location_type": context_type,
                "conversation_history": conversation_context,
                "previous_answer": previous_answer
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
            print(f"ambiguity_check_result: {result}")
            
            # If ambiguous and we have context, provide it
            if result["is_ambiguous"] and location:
                # Fix: Check if location_context exists and is not None before trying to assign to it
                if result.get("ambiguity_type") in ["location_reference", "both"]:
                    # Initialize location_context if it doesn't exist or is None
                    if "location_context" not in result or result["location_context"] is None:
                        result["location_context"] = {}
                    result["location_context"]["location"] = location
                    result["location_context"]["type"] = context_type

            # Prepare return values based on the new format
            ambiguity_type = result.get("ambiguity_type")
            context_needed = {
                "location": result.get("location_context", {}).get("location") if result.get("location_context") else location if ambiguity_type in ["location_reference", "both"] else None,
                "type": result.get("location_context", {}).get("type") if result.get("location_context") else context_type if ambiguity_type in ["location_reference", "both"] else None,
                "subject": result.get("subject_context")
            }

            return (
                result["is_ambiguous"],
                ambiguity_type,
                context_needed
            )

        except Exception as e:
            print(f"Error in ambiguity check: {str(e)}")
            # Fallback to basic check
            if any(word in question.lower() for word in ['here', 'this state', 'that state', 'it', 'its']):
                return True, 'location_reference', {
                    'location': location,
                    'type': context_type,
                    'subject': None
                }
            if any(word in question.lower() for word in ['what about', 'how about', 'compare', 'largest', 'biggest', 'smallest']):
                return True, 'subject_reference', {
                    'location': location,
                    'type': context_type,
                    'subject': None
                }
            return False, None, None

    def resolve_ambiguous_question(self, question, ambiguity_type, context, conversation_history=None):
        """
        Resolve ambiguous questions using provided context and GPT
        Returns: resolved question or None if can't resolve
        """
        if not context:
            return None

        try:
            system_prompt = """You are an expert at resolving ambiguous geographic questions.
            Given a question with ambiguous references and the context, rewrite the question 
            to be explicit and unambiguous.
            
            For location references:
            - Replace "here" with the specific location name
            - Replace "it/its" referring to a location with the location name
            - Replace "this/that state/county" with the specific location name
            - Add state context to city references when missing
            
            For subject references:
            - Use the conversation history to determine what subject the user is referring to
            - Replace vague references like "what about" with the specific subject from previous exchanges
            - For comparative questions, make both the subject and location explicit
            - When the subject is a heating type (gas, electricity, oil), be specific about "households with [type] heating"
            
            Examples:
            
            Question: "What's the population density here?"
            Context: {"location": "California", "type": "state"}
            Resolved: "What's the population density in California?"
            
            Question: "What about Illinois?"
            Context: {"location": "Kansas", "type": "state", "conversation_history": "User: What's the income level of Kansas? Assistant: The median household income in Kansas is $59,597."}
            Resolved: "What's the income level of Illinois?"
            
            Question: "What about electricity?"
            Context: {"location": "Michigan", "type": "state", "conversation_history": "User: How many households use gas heating in Michigan? Assistant: Michigan has 3,371,101 households with gas heating."}
            Resolved: "How many households use electricity heating in Michigan?"
            
            Question: "How does it compare to its neighbors?"
            Context: {"location": "Kansas", "type": "state", "conversation_history": "User: What's the income level of Kansas? Assistant: The median household income in Kansas is $59,597."}
            Resolved: "How does the income level of Kansas compare to the income levels of Kansas's neighboring states?"
            
            Question: "What's the biggest city?"
            Context: {"location": "New York", "type": "state"}
            Resolved: "What's the biggest city in New York state?"
            """

            # Format conversation history for context if available
            if conversation_history and len(conversation_history) > 0:
                # Take up to last 3 exchanges for context
                recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
                context_history = "\n".join([f"{'User' if i % 2 == 0 else 'Assistant'}: {msg}" for i, msg in enumerate(recent_history)])
                context["conversation_history"] = context_history

            user_prompt = f"Question: {question}\nContext: {context}\nAmbiguity Type: {ambiguity_type}"
            print(f"ambiguious_question_resolution_prompt: {user_prompt}")

            response = openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0
            )

            resolved_question = response.choices[0].message.content.strip()
            print(f"ambiguious_question_resolution_result: {resolved_question}")
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
            
            print(f"navigation_action_result: {result}")
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