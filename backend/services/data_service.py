# services/data_service.py
import duckdb
import geopandas as gpd
import json
from flask import jsonify
import numpy as np
import pandas as pd
from libpysal.weights import KNN
from esda import Moran_Local, Moran
import openai
from config import DevelopmentConfig
from services.semantic_service import SemanticService
import traceback
from scipy.stats import chi2_contingency
import libpysal
from scipy.spatial.distance import squareform, pdist

# Initialize DuckDB connection
con = duckdb.connect('database/spatial-db.db', read_only=True)
con.execute("INSTALL 'spatial';")
con.execute("LOAD 'spatial';")

# Initialize the semantic service
semantic_service = SemanticService()

# Define a centralized metric mapping dictionary with simplified structure
METRIC_MAPPING = {
    'ppl_densit': {
        'name': 'population density',
        'unit': 'people per square mile',
        'is_percentage': False
    },
    'pct_tot_co': {
        'name': 'underserved population',
        'unit': '%',
        'is_percentage': True
    },
    'pct_no_bb_': {
        'name': 'people lacking broadband or computer access',
        'unit': '%',
        'is_percentage': True,
        'prefix': 'of'
    },
    'gas': {
        'name': 'households with gas heating',
        'unit': 'households',
        'is_percentage': False
    },
    'electricit': {
        'name': 'households with electricity heating',
        'unit': 'households',
        'is_percentage': False
    },
    'oil': {
        'name': 'households with oil heating',
        'unit': 'households',
        'is_percentage': False
    },
    'pct_gas': {
        'name': 'households that use gas heating',
        'unit': '%',
        'is_percentage': True,
        'prefix': 'of'
    },
    'pct_electr': {
        'name': 'households that use electricity heating',
        'unit': '%',
        'is_percentage': True,
        'prefix': 'of'
    },
    'pct_oil': {
        'name': 'households that use oil heating',
        'unit': '%',
        'is_percentage': True,
        'prefix': 'of'
    }
}

def get_metric_info(dataset):
    """Get metric information for a dataset and handle percentage formatting"""
    # Get the base metric info or create a default one
    metric_info = METRIC_MAPPING.get(dataset, {
        'name': dataset,
        'unit': '',
        'is_percentage': dataset.startswith('pct_')
    })
    
    # Add a formatting function to the metric info
    def format_value(value):
        if metric_info['is_percentage'] or dataset.startswith('pct_'):
            # Multiply by 100 for percentage values if they're in decimal form (0-1 range)
            if value < 1:
                value = value * 100
            return f"{value:.1f}%"
        else:
            # For non-percentage values, format based on the type of metric
            if metric_info['unit'] == 'households':
                # Format household counts as integers
                return f"{int(value):,} {metric_info['unit']}"
            elif metric_info['unit']:
                # For other units like population density, use 2 decimal places
                return f"{value:.2f} {metric_info['unit']}"
            else:
                return f"{value:.2f}"
    
    # Add a function to get the full description with optional prefix
    def get_description():
        prefix = metric_info.get('prefix', '')
        if prefix:
            return f"{prefix} {metric_info['name']}"
        return metric_info['name']
    
    metric_info['format_value'] = format_value
    metric_info['get_description'] = get_description
    return metric_info

# Convert the string representation of neighbors array to actual array
def parse_neighbors(neighbors_str):
    if pd.isna(neighbors_str) or neighbors_str is None:
        return [None, None, None, None]
    try:
        # Remove brackets and split by comma
        neighbors = neighbors_str.strip('[]').split(',')
         # Clean up each value and replace empty or 'none' with None
        neighbors = [s.strip().strip("'\"") for s in neighbors]
        neighbors = [s if s and s.lower() != 'none' else None for s in neighbors]
        return neighbors
    except:
        return [None, None, None, None]


def fetch_data(table_name, accuracy, value_column='ppl_densit', state_filter=None):
    try:
        # Add state filter to query if provided
        where_clause = f"WHERE LOWER(state_name) = LOWER('{state_filter}')" if state_filter else ""
        
        # Adjust columns based on table type
        county_column = "county_nam as county_name," if table_name == 'county' else ""
        
        query = f"""
        SELECT GEOID, state_name,
               COALESCE({value_column}, 0) as value,
               {county_column}
               ST_X(ST_Centroid(geom)) as c_lon,
               ST_Y(ST_Centroid(geom)) as c_lat,
               ST_AsText(ST_Simplify(geom, {accuracy})) AS geom_wkt,
               neighbors_
        FROM {table_name}
        {where_clause}
        """
        
        query_result = con.execute(query).fetchdf()
        
        if query_result.empty:
            raise ValueError(f"No data found for state: {state_filter}")
            
        gdf = gpd.GeoDataFrame(query_result, geometry=gpd.GeoSeries.from_wkt(query_result['geom_wkt']))
        
        # LISA classifications
        lisa_results = get_lisa_clusters(value_column, state_filter)  # Pass the current dataset and state_filter
        if lisa_results:
            lisa_mapping = {}
            for state in lisa_results['HH']:
                lisa_mapping[state] = 'HH'
            for state in lisa_results['LL']:
                lisa_mapping[state] = 'LL'
            for state in lisa_results['HL']:
                lisa_mapping[state] = 'HL'
            for state in lisa_results['LH']:
                lisa_mapping[state] = 'LH'
            
            gdf['lisa_class'] = gdf['state_name'].map(lisa_mapping)
        
        # Centroid coordinates and county name in the properties
        gdf['c_lon'] = query_result['c_lon']
        gdf['c_lat'] = query_result['c_lat']
        if 'county_name' in query_result.columns:
            gdf['county_name'] = query_result['county_name']

        # Parse the neighbors column
        gdf['neighbors_'] = gdf['neighbors_'].apply(parse_neighbors)
        
        gdf.drop(columns=['geom_wkt'], inplace=True)
        geojson_data = json.loads(gdf.to_json())
        
        # Debug log
        # print(f"GeoJSON features count: {len(geojson_data['features'])}")
        # if geojson_data['features']:
        #     print(f"Sample feature properties: {geojson_data['features'][0]['properties']}")
        
        return jsonify(geojson_data)
    
    except Exception as e:
        print(f"Error in fetch_data: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        raise  # Re-raise the exception to be caught by the route handler

def fetch_fuel_data(table_name, accuracy, state_filter=None):
    """Fetch data for all fuel types (gas, electricity, oil) for the dot density map"""
    try:
        # Add state filter to query if provided
        where_clause = f"WHERE LOWER(state_name) = LOWER('{state_filter}')" if state_filter else ""
        
        # Add county_name column if fetching county data
        county_column = "county_nam as county_name," if table_name == 'county' else ""

        ## Add rural column
        rural_column = "rural," if table_name == 'county' else ""
        
        query = f"""
        SELECT GEOID, state_name, 
               {county_column}
               COALESCE(gas, 0) as gas,
               COALESCE(electricit, 0) as electricity,
               COALESCE(oil, 0) as oil,
               main_fuel,
               {rural_column}
               ST_X(ST_Centroid(geom)) as c_lon,
               ST_Y(ST_Centroid(geom)) as c_lat,
               ST_AsText(ST_Simplify(geom, {accuracy})) AS geom_wkt,
               neighbors_
        FROM {table_name}
        {where_clause}
        """
        
        query_result = con.execute(query).fetchdf()
        
        if query_result.empty:
            raise ValueError(f"No data found in {table_name} {where_clause}")
            
        gdf = gpd.GeoDataFrame(query_result, geometry=gpd.GeoSeries.from_wkt(query_result['geom_wkt']))
        
        # Centroid coordinates
        gdf['c_lon'] = query_result['c_lon']
        gdf['c_lat'] = query_result['c_lat']
        
        # Parse the neighbors column
        gdf['neighbors_'] = gdf['neighbors_'].apply(parse_neighbors)
        
        gdf.drop(columns=['geom_wkt'], inplace=True)
        geojson_data = json.loads(gdf.to_json())
        
        # Return the GeoJSON as a proper Flask response
        return jsonify(geojson_data)
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error fetching fuel data: {str(e)}\n{error_details}")
        raise e

def execute_query(query):
    """Execute a DuckDB query and return results as a list of dictionaries"""
    try:
        # Execute the query using the existing DuckDB connection
        result = con.execute(query).fetchdf()
        
        # Convert DataFrame to list of dictionaries
        records = result.to_dict('records')
        return records
        
    except Exception as e:
        print(f"Error executing query: {str(e)}")
        return None

def check_location_exists(location):
    """Check if a location exists in our database"""
    try:
        query = """
            SELECT state_name 
            FROM state 
            WHERE LOWER(state_name) LIKE LOWER(?)
        """
        result = con.execute(query, [f"%{location}%"]).fetchone()
        return bool(result)
    except Exception as e:
        print(f"Error checking location: {str(e)}")
        return False

#######################################
# Answering Queries
#######################################


def answer_question(question, current_dataset, current_focus=None):
    """Answer any question for any dataset based on query type"""
    try:
        # First try to extract county information if this might be a county question
        if 'County' in question or 'county' in question:
            try:
                counties = semantic_service.extract_counties(question, current_focus)
                if counties:
                    county_info = counties[0]  # Take the first county if multiple are found
                    print(f"Debug - Using county: {county_info['county']}, state: {county_info['state']}")
                    
                    result = retrieve_value(county_info['county'], current_dataset, 
                                         is_county=True, state=county_info['state'])
                    if result:
                        return {
                            'result': result['result'],
                            'county': county_info['county'],
                            'state': county_info['state'],
                            'dataset': current_dataset,
                            'question_type': 'retrieve'
                        }
            except Exception as e:
                print(f"Error handling county question: {str(e)}")

        # Get the question type for non-county questions or if county lookup failed
        question_type = semantic_service.identify_question_type(question, current_dataset)
        
        # Extract state filter from current_focus if available
        state_filter = None
        county_view = False
        if current_focus:
            if isinstance(current_focus, dict):
                if current_focus.get('state'):
                    state_filter = current_focus.get('state')
                # Check if we're in county view - either by having a county or by having showingCounties flag
                if current_focus.get('county') or current_focus.get('showingCounties'):
                    county_view = True
            elif isinstance(current_focus, str):
                state_filter = current_focus
            elif isinstance(current_focus, list):  # Handle case where current_focus is a list
                state_filter = current_focus[0] if current_focus else None
        
        print(f"DEBUG - State filter extracted: {state_filter}, County view: {county_view}")
        
        # Handle pattern questions before metric check
        if question_type == 'get_pattern':
            # For Task2, return hardcoded answer about heating fuel patterns
            if current_dataset in ['gas', 'electricity', 'oil']:
                # Use urban_rural_comparison when in county view OR when we have a state filter
                if county_view and state_filter:
                    result = compare_urban_rural_heating_fuels(state_filter)
                    return {
                        'result': result,
                        'dataset': current_dataset,
                        'question_type': 'urban_rural_comparison',
                        'state': state_filter
                    }
                # For state level view, use the original hardcoded answer
                else:
                    pattern_result = 'Yes, there is a clustered pattern in the map; states with similar heating fuel composition tend to be located near each other.'
                    description_result = 'Southern states like Florida, Texas, and Georgia use predominantly electricity, midwestern states like Minnesota, Illinois, and Wisconsin use predominantly gas, and northeastern states like Maine and Vermont use predominantly oil.'
                    return {
                        'result': f"{pattern_result} {description_result}",
                        'dataset': current_dataset,
                        'question_type': 'get_pattern'
                    }
            
            # For other datasets, combine Moran's I and LISA analysis
            moran_result = get_moran_i(current_dataset, state_filter)
            
            # If there's no pattern, just return that without the description
            if moran_result['pattern'] == 'random':
                return {
                    'result': moran_result['description'],
                    'dataset': current_dataset,
                    'question_type': 'get_pattern'
                }
            
            # Otherwise, add the pattern description
            lisa_result = get_lisa_clusters(current_dataset, state_filter)
            pattern_description = get_gpt_spatial_pattern_summary(lisa_result, current_dataset, state_filter)
            
            return {
                'result': f"{moran_result['description']} {pattern_description}",
                'dataset': current_dataset,
                'question_type': 'get_pattern'
            }
            
        elif question_type == 'urban_rural_comparison' and current_dataset in ['gas', 'electricity', 'oil']:
            # Extract state from the question or use the current focused state
            states = semantic_service.extract_states(question)
            state_name = states[0] if states else None
            
            # If no state was mentioned in the question but there's a focused state,
            # use the focused state from the frontend
            if not state_name and isinstance(current_focus, dict) and current_focus.get('state'):
                state_name = current_focus.get('state')
            elif not state_name and isinstance(current_focus, str) and current_focus:
                state_name = current_focus
            
            # Handle urban vs rural comparison for heating fuels
            result = compare_urban_rural_heating_fuels(state_name)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'urban_rural_comparison',
                'state': state_name
            }

        if question_type == 'retrieve':
            # Check if this is a county question
            if 'County' in question:
                try:
                    # Extract county information using the new method
                    counties = semantic_service.extract_counties(question, current_focus)
                    if counties:
                        county_info = counties[0]  # Take the first county if multiple are found
                        print(f"Debug - Using county: {county_info['county']}, state: {county_info['state']}")
                        
                        result = retrieve_value(county_info['county'], current_dataset, 
                                             is_county=True, state=county_info['state'])
                        if result:
                            return {
                                'result': result['result'],
                                'county': county_info['county'],
                                'state': county_info['state'],
                                'dataset': current_dataset,
                                'question_type': 'retrieve'
                            }
                    
                    print("Debug - County parsing failed, falling back to state-level")
                except Exception as e:
                    print(f"Error parsing county question: {str(e)}")
            
            # Handle state-level questions
            states = semantic_service.extract_states(question)
            if not states:
                return None
            result = retrieve_value(states[0], current_dataset)
            return {
                'result': result['result'],
                'state': result['state'],
                'dataset': current_dataset,
                'question_type': 'retrieve'
            }
            
        elif question_type == 'compare':
            states = semantic_service.extract_states(question)
            if len(states) != 2:
                return None
            result = compare_states(states[0], states[1], current_dataset)
            return {
                'result': result,
                'states': states,
                'dataset': current_dataset,
                'question_type': 'compare'
            }
            
        elif question_type == 'find_extremum':
            result = get_extrema(question, current_dataset, state_filter)
            return {
                'result': result['result'],
                'state': result['state'],
                'county': result['county'],
                'dataset': current_dataset,
                'question_type': 'find_extremum'
            }
            
        elif question_type == 'aggregate':
            result = get_mean(current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'aggregate'
            }
            
        elif question_type == 'filter':
            result = filter(question, current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'filter'
            }
            
        elif question_type == 'sort':
            result = sort(question, current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'sort'
            }
            
        elif question_type == 'data_ranges':
            result = get_data_range(current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'data_ranges'
            }
            
        elif question_type == 'cluster':
            states = semantic_service.extract_states(question)
            if not states:
                return None
            result = find_similar(states[0], current_dataset)
            return {
                'result': result['result'],
                'state': result['state'],
                'dataset': current_dataset,
                'question_type': 'cluster'
            }
            
        elif question_type == 'find_outliers':
            result = get_lisa_clusters(current_dataset, current_focus)
            outliers = find_outliers(result, current_dataset)
            return {
                'result': outliers,
                'dataset': current_dataset,
                'question_type': 'find_outliers'
            }
            
        elif question_type == 'correlate':
            return None
        
        elif question_type == 'describe_shape':
            return None
            
        elif question_type == 'others':
            return None

        return None

    except Exception as e:
        print(f"Error in answer_question: {str(e)}")
        return None


#######################################
# Query Functions
#######################################

#00_retrieve
def retrieve_value(state_or_county_name, dataset, is_county=False, state=None):
    """Get the exact value for a state/county and dataset"""
    try:
        if is_county and state:  # Only proceed with county lookup if we have both county and state
            query = f"""
                SELECT county_nam as county_name, state_name,
                       COALESCE({dataset}, 0) as value
                FROM county
                WHERE LOWER(county_nam) LIKE LOWER(?) || '%'
                AND LOWER(state_name) = LOWER(?)
            """
            print(f"Debug - County query params: {state_or_county_name}, {state}")  # Debug line
            result = con.execute(query, [state_or_county_name, state]).fetchone()
            if result:
                print(f"Debug - County query result: {result}")  # Debug line
        else:
            query = f"""
                SELECT state_name,
                       COALESCE({dataset}, 0) as value
                FROM state
                WHERE LOWER(state_name) = LOWER(?)
            """
            result = con.execute(query, [state_or_county_name]).fetchone()
            
        if not result:
            return None
            
        metric_info = get_metric_info(dataset)
        formatted_value = metric_info['format_value'](result[-1])  # Last element is always the value
        
        # Generate response based on location type and dataset
        if is_county:
            county, state, value = result
            location_phrase = f"{county} County in {state}"
        else:
            state, value = result
            location_phrase = f"{state}"
        
        # Get description using the helper function
        description = metric_info['get_description']()
        
        # Special case for population density to avoid redundancy
        if dataset == 'ppl_densit':
            return {
                'result': f"{location_phrase} has {formatted_value}.",
                'county': county if is_county else None,
                'state': state
            }
        else:
            return {
                'result': f"{location_phrase} has {formatted_value} {description}.",
                'county': county if is_county else None,
                'state': state
            }
            
    except Exception as e:
        print(f"Error retrieving value: {str(e)}")
        return None

#01_compare
def compare_states(state1, state2, dataset):
    """Compare values between two states"""
    try:
        query = f"""
            SELECT state_name, 
                COALESCE({dataset}, 0) as value
            FROM state
            WHERE LOWER(state_name) IN (LOWER(?), LOWER(?))
        """
        results = con.execute(query, [state1, state2]).fetchall()
        # print(f"Debug - Compare states results: {results}")
        if len(results) != 2:
            return None
            
        # Convert input state names to title case for matching
        state1 = state1.title()
        state2 = state2.title()
        
        state1_data = next(r for r in results if r[0].lower() == state1.lower())
        state2_data = next(r for r in results if r[0].lower() == state2.lower())
        
        metric_info = get_metric_info(dataset)
        
        # Determine which state has higher value
        higher_state = state1_data[0] if state1_data[1] > state2_data[1] else state2_data[0]
        lower_state = state2_data[0] if state1_data[1] > state2_data[1] else state1_data[0]
        
        return (
            f"{state1_data[0]} has {state1_data[1]:.2f} {metric_info['unit']} {metric_info['name']} while "
            f"{state2_data[0]} has {state2_data[1]:.2f} {metric_info['unit']}. "
            f"{higher_state} has higher {metric_info['name']} than {lower_state}."
        )
    except Exception as e:
        print(f"Error comparing states: {str(e)}")
        return None

#02_find_extremum
def get_extrema(question, dataset, state_filter=None):
    """Get highest or lowest value based on question, optionally filtered by state"""
    try:
        is_highest = any(word in question.lower() for word in ["highest", "most", "largest", "greatest"])
        
        # Handle state_filter if it's a list
        if isinstance(state_filter, list):
            state_filter = state_filter[0] if state_filter else None
        
        # Check if this is a county-level question
        is_county_question = 'county' in question.lower()
        
        # Determine which table to use based on whether it's a county question
        table_name = 'county' if is_county_question else 'state'
        name_column = 'county_nam' if is_county_question else 'state_name'
        state_column = 'state_name' if is_county_question else 'state_name'
        
        # Build WHERE clause
        where_clause = f"WHERE {dataset} IS NOT NULL"
        if state_filter and is_county_question:
            where_clause += f" AND LOWER(state_name) = LOWER('{state_filter}')"
        elif state_filter and not is_county_question:
            # For state-level questions, we're asking about all states even when focused on one
            pass
        
        query = f"""
            SELECT {name_column} as name, 
                {state_column} as state_name,
                COALESCE({dataset}, 0) as value
            FROM {table_name}
            {where_clause}
            ORDER BY value {'DESC' if is_highest else 'ASC'}
            LIMIT 1
        """
        
        result = con.execute(query).fetchone()
        if not result:
            return None
            
        metric_info = get_metric_info(dataset)
        
        # Format the location description
        location_desc = f"{result[0]} County in {result[1]}" if is_county_question else result[0]
        
        value_str = metric_info['format_value'](result[2])
        
        return {
            'result': f"{location_desc} has the {'highest' if is_highest else 'lowest'} {metric_info['name']} of {value_str}.",
            'state': result[1],  # Always return the state name
            'county': result[0] if is_county_question else None  # Return county name if it's a county question
        }
    except Exception as e:
        print(f"Error getting extrema: {str(e)}")
        return None

#03_mean
def get_mean(dataset):
    """Calculate mean value across"""
    try:
        query = f"""
            SELECT AVG(
                COALESCE({dataset}, 0)
            ) as avg_value
            FROM state
        """
        
        result = con.execute(query).fetchone()
        if not result or result[0] is None:
            return None
            
        metric_info = get_metric_info(dataset)
        
        return f"The average {metric_info['name']} across all states is {result[0]:.2f} {metric_info['unit']}."
    except Exception as e:
        print(f"Error calculating average: {str(e)}")
        return None

#04_filter
def filter(question, dataset):
    """Filter based on conditions"""
    try:
        # Extract condition from question using GPT
        system_prompt = """Extract the numeric condition from the question.
        Return in format: operator,value
        Example: "Which states have density less than 100?" -> "<,100"
        Operators: <,>,<=,>=,="""
        
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question}
            ],
            temperature=0
        )
        
        condition = response.choices[0].message.content.strip()
        operator, value = condition.split(',')
        
        # Build and execute query
        query = f"""
            SELECT state_name, {dataset} as value
            FROM state
            WHERE {dataset} {operator} {value}
            ORDER BY {dataset} DESC
        """
        
        results = con.execute(query).fetchall()
        if not results:
            return f"No states match the condition."

            
        states = [r[0] for r in results]
        metric_info = get_metric_info(dataset)
        return f"States with {metric_info['name']} {operator} {value}: {', '.join(states)}"
        
    except Exception as e:
        print(f"Error in filter_states: {str(e)}")
        return None

#05_sort
def sort(question, dataset):
    """Sort based on values"""
    try:
        # Extract number of results from question
        system_prompt = """Extract the number of results requested.
        Return just the number, or '50' if not specified.
        
        Example: "Which four states have the highest population density?" -> "4"
        """
        
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question}
            ],
            temperature=0
        )
        
        limit = int(response.choices[0].message.content.strip())
        
        query = f"""
            SELECT state_name, {dataset} as value
            FROM state
            ORDER BY {dataset} DESC
            LIMIT {limit}
        """
        
        results = con.execute(query).fetchall()
        metric_info = get_metric_info(dataset)
        
        formatted_results = [f"{i+1}. {r[0]} ({r[1]:.2f} {metric_info['unit']})" 
                           for i, r in enumerate(results)]
        return f"Top {limit} states by {metric_info['name']}:\n" + "\n".join(formatted_results)
        
    except Exception as e:
        print(f"Error in sort_states: {str(e)}")
        return None

#06_data_range
def get_data_range(dataset):
    """Get the range of values in the dataset"""
    try:
        query = f"""
            SELECT MIN({dataset}) as min_val, 
                   MAX({dataset}) as max_val,
                   AVG({dataset}) as avg_val
            FROM state
        """
        
        result = con.execute(query).fetchone()
        metric_info = get_metric_info(dataset)
        unit = metric_info['unit']
        
        return (f"The {metric_info['name']} ranges from {result[0]:.2f} to {result[1]:.2f} {unit}, "
                f"with an average of {result[2]:.2f} {unit}.")
                
    except Exception as e:
        print(f"Error in get_data_range: {str(e)}")
        return None

#07_find_similar
def find_similar(state, dataset):
    """Find states with similar values"""
    try:
        # First get the value for the reference state
        query = f"""
            SELECT {dataset} as value
            FROM state
            WHERE LOWER(state_name) = LOWER(?)
        """
        
        ref_result = con.execute(query, [state]).fetchone()
        if not ref_result:
            return {
                'result': f"Could not find state: {state.title()}",
                'state': state.title()
            }
        
        ref_value = ref_result[0]
        
        # Then find states within 10% of this value
        margin = ref_value * 0.1
        query = f"""
            SELECT state_name, {dataset} as value
            FROM state
            WHERE {dataset} BETWEEN ? AND ?
            AND LOWER(state_name) != LOWER(?)
            ORDER BY ABS({dataset} - ?)
            LIMIT 5
        """
        
        results = con.execute(query, [ref_value - margin, ref_value + margin, 
                                    state, ref_value]).fetchall()
                                    
        metric_info = get_metric_info(dataset)
        
        if not results:
            return {
                'result': f"No states have similar {metric_info['name']} to {state.title()}.",
                'state': state.title()
            }
            
        similar_states = [f"{r[0].title()} ({r[1]:.2f} {metric_info['unit']})" for r in results]
        return {
            'result': f"States with the closest {metric_info['name']} to {state.title()}: " + ", ".join(similar_states),
            'state': state.title()
        }
        
    except Exception as e:
        print(f"Error in find_similar: {str(e)}")
        return {
            'result': f"Error finding similar states to {state.title()}",
            'state': state.title()
        }

#08_identify_pattern
def get_moran_i(dataset, state_filter=None):
    """Analyze global spatial pattern using Moran's I, optionally filtered by state"""
    try:
        # Determine which table to use based on state_filter
        table_name = 'county' if state_filter else 'state'
        
        # Build WHERE clause - simpler approach
        where_clause = f"{dataset} IS NOT NULL"
        if state_filter:
            where_clause += f" AND LOWER(state_name) = LOWER('{state_filter}')"
        
        # Get geometries and data for the specified dataset
        query = f"""
            SELECT 
                {'county_nam as name' if state_filter else 'state_name as name'}, 
                {dataset} as value, 
                ST_AsText(geom) as geometry,
                c_lat, c_lon
            FROM {table_name}
            WHERE {where_clause}
        """
        result = con.execute(query).fetchdf()
        
        if result.empty:
            return {
                'pattern': 'unknown',
                'description': f"Unable to analyze pattern{' for ' + state_filter if state_filter else ''}. Not enough data available."
            }
        
        # Convert to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            result, 
            geometry=gpd.GeoSeries.from_wkt(result['geometry'])
        )
        
        # Create spatial weights matrix based on geography level
        if state_filter:
            # For county level, use Queen contiguity weights
            w = libpysal.weights.Queen.from_dataframe(gdf)
        else:
            # For state level, use distance band weights
            # Extract centroids from the data
            coords = np.array(list(zip(gdf['c_lon'], gdf['c_lat'])))
            
            # Compute distance matrix
            distance_matrix = squareform(pdist(coords))
            
            # Find each state's closest neighbor's distance (ignoring self)
            min_distances = np.min(distance_matrix + np.eye(len(gdf)) * 1e6, axis=1)
            
            # Max nearest-neighbor distance across all states
            max_nn_distance = max(min_distances)
            
            # Define threshold (20% above max nearest-neighbor distance)
            distance_threshold = max_nn_distance * 1.2
            
            # Create distance band weights
            w = libpysal.weights.DistanceBand.from_array(
                coords, 
                threshold=distance_threshold, 
                binary=True
            )
        
        # Handle islands (locations with no neighbors)
        if not w.islands:
            w.transform = 'r'  # Row-standardize weights
        else:
            # If there are islands, we need to handle them
            print(f"Warning: {len(w.islands)} locations have no neighbors")
            # Use KNN as fallback for islands
            knn = libpysal.weights.KNN.from_dataframe(gdf, k=1)
            w = libpysal.weights.util.attach_islands(w, knn)
            w.transform = 'r'
        
        # Calculate global Moran's I
        moran = Moran(gdf['value'], w)
        print(f"Moran's I: {moran.I}")
        print(f"Moran's p-value: {moran.p_sim}")
        
        # Get the metric name for better descriptions
        metric_info = get_metric_info(dataset)
        metric_name = metric_info['name']
        
        # Interpret the results and provide simple response
        if moran.p_sim < 0.1:  # Statistically significant
            if moran.I > 0:
                scope = f"in {state_filter}" if state_filter else "across the United States"
                response = {
                    'pattern': 'clustered',
                    'description': f"Yes, there is a clustered pattern of {metric_name} {scope}. Similar values tend to be located near each other."
                }
            else:
                scope = f"in {state_filter}" if state_filter else "across the United States"
                response = {
                    'pattern': 'dispersed',
                    'description': f"Yes, there is a dispersed pattern of {metric_name} {scope}. Dissimilar values tend to be located near each other."
                }
        else:
            scope = f"in {state_filter}" if state_filter else "in this map"
            response = {
                'pattern': 'random',
                'description': f"No, there is no obvious spatial pattern of {metric_name} {scope}."
            }
        
        return response
        
    except Exception as e:
        print(f"Error analyzing global pattern: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return {
            'pattern': 'error',
            'description': "I couldn't analyze the spatial pattern due to a technical issue."
        }

#09_describe_pattern
def get_lisa_clusters(dataset, state_filter=None):
    """Analyze spatial patterns using Local Moran's I and return cluster classifications, optionally filtered by state"""
    try:
        # Determine which table to use based on state_filter
        table_name = 'county' if state_filter else 'state'
        
        # Build WHERE clause - simpler approach
        where_clause = f"{dataset} IS NOT NULL"
        if state_filter:
            where_clause += f" AND LOWER(state_name) = LOWER('{state_filter}')"
        
        # Get geometries and data for the specified dataset
        query = f"""
            SELECT 
                {'county_nam as name' if state_filter else 'state_name as name'}, 
                {dataset} as value,
                ST_AsText(geom) as geometry,
                c_lat, c_lon
            FROM {table_name}
            WHERE {where_clause}
        """
        result = con.execute(query).fetchdf()
        
        if result.empty:
            return {
                'HH': [],
                'LL': [],
                'HL': [],
                'LH': []
            }
        
        # Convert to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            result, 
            geometry=gpd.GeoSeries.from_wkt(result['geometry'])
        )
        
        # Create spatial weights matrix based on geography level
        if state_filter:
            # For county level, use Queen contiguity weights
            w = libpysal.weights.Queen.from_dataframe(gdf)
        else:
            # For state level, use distance band weights
            # Extract centroids from the data
            coords = np.array(list(zip(gdf['c_lon'], gdf['c_lat'])))
            
            # Compute distance matrix
            distance_matrix = squareform(pdist(coords))
            
            # Find each state's closest neighbor's distance (ignoring self)
            min_distances = np.min(distance_matrix + np.eye(len(gdf)) * 1e6, axis=1)
            
            # Max nearest-neighbor distance across all states
            max_nn_distance = max(min_distances)
            
            # Define threshold (20% above max nearest-neighbor distance)
            distance_threshold = max_nn_distance * 1.2
            
            # Create distance band weights
            w = libpysal.weights.DistanceBand.from_array(
                coords, 
                threshold=distance_threshold, 
                binary=True
            )
        
        # Handle islands (locations with no neighbors)
        if not w.islands:
            w.transform = 'r'  # Row-standardize weights
        else:
            # If there are islands, we need to handle them
            print(f"Warning: {len(w.islands)} locations have no neighbors in LISA analysis")
            # Use KNN as fallback for islands
            knn = libpysal.weights.KNN.from_dataframe(gdf, k=1)
            w = libpysal.weights.util.attach_islands(w, knn)
            w.transform = 'r'
        
        # Calculate local Moran's I
        moran = Moran_Local(gdf['value'], w, permutations=999)
        
        # Add LISA statistics to the dataframe
        gdf['LISA_P'] = moran.p_sim
        
        # Assign cluster categories where p < 0.05
        significant = gdf['LISA_P'] < 0.05
        
        # Create lists of locations in each category
        hh_locations = gdf[significant & (moran.q == 1)]['name'].tolist()
        lh_locations = gdf[significant & (moran.q == 2)]['name'].tolist()
        ll_locations = gdf[significant & (moran.q == 3)]['name'].tolist()
        hl_locations = gdf[significant & (moran.q == 4)]['name'].tolist()
        
        return {
            'HH': hh_locations,
            'LL': ll_locations,
            'HL': hl_locations,
            'LH': lh_locations
        }
        
    except Exception as e:
        print(f"Error analyzing spatial patterns: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        return {
            'HH': [],
            'LL': [],
            'HL': [],
            'LH': []
        }
        
def get_gpt_spatial_pattern_summary(lisa_clusters, dataset, state_filter=None):
    """Get a natural language summary of spatial patterns using GPT"""
    try:
        metric_info = get_metric_info(dataset)
        metric_name = metric_info['name']
        
        # Check if we have any significant clusters
        has_clusters = any(len(cluster) > 0 for cluster in lisa_clusters.values())
        if not has_clusters:
            if state_filter:
                return f"There are no statistically significant clusters or outliers of {metric_name} among counties in {state_filter}."
            else:
                return f"There are no statistically significant clusters or outliers of {metric_name} among states."
        
        # Create description from LISA clusters
        description = []
        location_type = "counties" if state_filter else "states"
        
        if lisa_clusters['HH']:
            description.append(f"High-High clusters ({location_type} with high {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(lisa_clusters['HH'])}")
        if lisa_clusters['LL']:
            description.append(f"Low-Low clusters ({location_type} with low {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(lisa_clusters['LL'])}")
        if lisa_clusters['HL']:
            description.append(f"High-Low outliers ({location_type} with high {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(lisa_clusters['HL'])}")
        if lisa_clusters['LH']:
            description.append(f"Low-High outliers ({location_type} with low {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(lisa_clusters['LH'])}")
        
        raw_description = '. '.join(description)
        
        scope = f"in {state_filter}" if state_filter else "across the United States"
        prompt = f"""
        Summarize the following {metric_name} patterns {scope} in a single, concise paragraph following this structure:
        1. First mention high-value clusters with 1-2 example {location_type}
        2. Then mention low-value clusters with 1-2 example {location_type}
        3. Finally, mention any notable outliers (high values surrounded by low or vice versa)
        
        Keep the summary brief and focused on the most significant patterns.
        
        Raw analysis:
        {raw_description}
        """
        
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system", 
                    "content": f"""You are a spatial analysis expert who provides concise summaries for the general public. 
                    Focus on the most significant patterns and use clear geographic references. 
                    Keep responses to within 50 words and always include example {location_type}.
                    Pick examples that makes the most sense for the metric."""
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        print(f"Error getting GPT summary: {str(e)}")
        if state_filter:
            return f"I found some patterns in {metric_name} among counties in {state_filter}, but couldn't generate a detailed summary."
        else:
            return f"I found some patterns in {metric_name} across states, but couldn't generate a detailed summary."

#10_find_outliers
def find_outliers(lisa_results, dataset):
    """Format outlier results from LISA analysis with natural language description (max 3 examples)"""
    try:
        metric_info = get_metric_info(dataset)
        
        if not (lisa_results['HL'] or lisa_results['LH']):
            return f"No significant outliers found in {metric_info['name']}."
        
        parts = []
        if lisa_results['HL']:
            states = ', '.join(lisa_results['HL'][:3]) 
            if len(lisa_results['HL']) > 3:
                states
            parts.append(f"{states}, where {metric_info['name']} is relatively high compared to its neighbors")
            
        if lisa_results['LH']:
            states = ', '.join(lisa_results['LH'][:3])
            if len(lisa_results['LH']) > 3:
                states 
            parts.append(f"{states}, where {metric_info['name']} is relatively low compared to its neighbors")
        
        if len(parts) == 2:
            return f"Outliers include states like {parts[0]}. There are also {parts[1]}."
        else:
            return f"Outliers include states like {parts[0]}."
        
    except Exception as e:
        print(f"Error formatting outliers: {str(e)}")
        return None

def compare_urban_rural_heating_fuels(state_name=None):
    """Compare urban and rural counties' predominant heating fuel types within a specific state"""
    try:
        # Handle state_name if it's a list or other non-string type
        if state_name:
            if isinstance(state_name, list):
                # Take the first element if it's a list
                state_name = state_name[0] if state_name else None
            # Convert to string to ensure SQL safety
            state_name = str(state_name)
        
        # Add state filter if provided
        state_filter = f"AND LOWER(state_name) = LOWER('{state_name}')" if state_name else ""
        
        # Query to get county data with urban/rural classification and predominant fuel
        query = f"""
        SELECT 
            rural,  -- 'Rural' or 'Not rural'
            main_fuel,
            COUNT(*) as count
        FROM county
        WHERE rural IS NOT NULL AND main_fuel IS NOT NULL
        {state_filter}
        GROUP BY rural, main_fuel
        ORDER BY rural, main_fuel
        """
        
        result = con.execute(query).fetchdf()
        
        if result.empty:
            return f"I couldn't find data on urban and rural counties' heating fuel usage{' in ' + state_name if state_name else ''}."
        
        # Create a contingency table
        contingency_table = result.pivot(index='rural', columns='main_fuel', values='count').fillna(0)
        
        # Check if we have both rural and non-rural counties
        if 'Rural' not in contingency_table.index or 'Not rural' not in contingency_table.index:
            return f"I couldn't compare urban and rural counties in {state_name} because there aren't enough counties of both types."
        
        # Calculate percentages for each fuel type
        urban_total = contingency_table.loc['Not rural'].sum()
        rural_total = contingency_table.loc['Rural'].sum()
        
        urban_percentages = (contingency_table.loc['Not rural'] / urban_total * 100).round(1)
        rural_percentages = (contingency_table.loc['Rural'] / rural_total * 100).round(1)
        
        # Prepare the response with the new first sentence
        state_phrase = f" in {state_name}" if state_name else ""
        response = f"Here's a breakdown of predominantly used heating fuels{state_phrase}.\n\n"
        
        # Add detailed breakdown for urban counties
        urban_breakdown = []
        for fuel_type in contingency_table.columns:
            if urban_percentages[fuel_type] > 0:
                urban_breakdown.append(f"{urban_percentages[fuel_type]}% predominantly use {fuel_type}")
        
        if urban_breakdown:
            response += f"For urban counties: {', '.join(urban_breakdown)}.\n"
        
        # Add detailed breakdown for rural counties
        rural_breakdown = []
        for fuel_type in contingency_table.columns:
            if rural_percentages[fuel_type] > 0:
                rural_breakdown.append(f"{rural_percentages[fuel_type]}% predominantly use {fuel_type}")
        
        if rural_breakdown:
            response += f"For rural counties: {', '.join(rural_breakdown)}."
        
        return response
        
    except Exception as e:
        print(f"Error comparing urban and rural heating fuels: {str(e)}")
        # Format the state name for error message
        state_display = state_name if isinstance(state_name, str) else str(state_name)
        state_phrase = f" in {state_display}" if state_name else ""
        return f"I couldn't analyze the difference between urban and rural counties{state_phrase} due to a technical issue."

