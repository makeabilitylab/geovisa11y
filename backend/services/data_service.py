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

# Initialize DuckDB connection
con = duckdb.connect('database/spatial-db.db', read_only=True)
con.execute("INSTALL 'spatial';")
con.execute("LOAD 'spatial';")

# Initialize the semantic service
semantic_service = SemanticService()

# Define a centralized metric mapping dictionary
METRIC_MAPPING = {
    'ppl_densit': {
        'name': 'population density',
        'unit': 'people per square mile',
        'is_percentage': False
    },
    'walk_to_wo': {
        'name': 'percentage of people walking to work',
        'unit': '%',
        'is_percentage': True,
        'verb': 'walk'
    },
    'transit_to': {
        'name': 'percentage of people using public transit',
        'unit': '%',
        'is_percentage': True,
        'verb': 'take public transit'
    },
    'pct_tot_co': {
        'name': 'percentage of priority population',
        'unit': '%',
        'is_percentage': True
    },
    'pct_no_bb_': {
        'name': 'percentage of people lacking broadband or computer access',
        'unit': '%',
        'is_percentage': True
    },
    'gas': {
        'name': 'number of households with gas heating',
        'unit': 'households with gas heating',
        'is_percentage': False
    },
    'electricit': {
        'name': 'number of households with electricity heating',
        'unit': 'households with electricity heating',
        'is_percentage': False
    },
    'oil': {
        'name': 'number of households with oil heating',
        'unit': 'households with oil heating',
        'is_percentage': False
    }
}

def get_metric_info(dataset):
    """Get metric information for a dataset"""
    return METRIC_MAPPING.get(dataset, {
        'name': dataset,
        'unit': '',
        'is_percentage': False
    })

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
               CASE 
                   WHEN '{value_column}' IN ('walk_to_wo', 'transit_to')
                   THEN COALESCE({value_column}, 0) * 100  -- Multiply percentages by 100
                   ELSE COALESCE({value_column}, 0)
               END as value,
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
        lisa_results = get_lisa_clusters(value_column)  # Pass the current dataset
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
        
        # Calculate main_fuel on the fly if it doesn't exist as a column
        # main_fuel_calc = """
        #     CASE 
        #         WHEN gas > electricity AND gas > oil THEN 'gas'
        #         WHEN electricity > gas AND electricity > oil THEN 'electricity'
        #         WHEN oil > gas AND oil > electricity THEN 'oil'
        #         ELSE 'mixed'
        #     END as main_fuel
        # """
        
        query = f"""
        SELECT GEOID, state_name, 
               {county_column}
               COALESCE(gas, 0) as gas,
               COALESCE(electricit, 0) as electricity,
               COALESCE(oil, 0) as oil,
               main_fuel,
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
        # Get the question type first
        question_type = semantic_service.identify_question_type(question, current_dataset)
        #print(f"Debug - Question type identified in answer_question: {question_type}")

        # Handle pattern questions before metric check
        if question_type == 'get_pattern':
            # For Task2, return hardcoded answer about heating fuel patterns
            if current_dataset in ['gas', 'electricity', 'oil']:
                pattern_result = 'Yes, there is a clustered pattern in the map; states with similar heating fuel composition tend to be located near each other.'
                description_result = 'Southern states like Florida, Texas, and Georgia use predominantly electricity, midwestern states like Minnesota, Illinois, and Wisconsin use predominantly gas, and northeastern states like Maine and Vermont use predominantly oil.'
                return {
                    'result': f"{pattern_result} {description_result}",
                    'dataset': current_dataset,
                    'question_type': 'get_pattern'
                }
            
            # For other datasets, combine Moran's I and LISA analysis
            moran_result = get_moran_i(current_dataset)
            
            # If there's no pattern, just return that without the description
            if moran_result['pattern'] == 'random':
                return {
                    'result': moran_result['description'],
                    'dataset': current_dataset,
                    'question_type': 'get_pattern'
                }
            
            # Otherwise, add the pattern description
            lisa_result = get_lisa_clusters(current_dataset)
            pattern_description = get_gpt_spatial_pattern_summary(lisa_result, current_dataset)
            
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
                # Extract county and state names from the question
                parts = question.split('County,')
                if len(parts) == 2:
                    county_name = parts[0].strip().split()[-1]  # Get last word before "County"
                    state_name = parts[1].strip().strip('[]\'\"')  # Clean up state name
                    result = retrieve_value(county_name, current_dataset, is_county=True)
                    if result:
                        return {
                            'result': result['result'],
                            'county': county_name,
                            'state': state_name,
                            'dataset': current_dataset,
                            'question_type': 'retrieve'
                        }
            
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
            result = get_extrema(question, current_dataset)
            return {
                'result': result['result'],
                'state': result['state'],
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
            result = get_lisa_clusters(current_dataset)
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
def retrieve_value(state_or_county_name, dataset, is_county=False):
    """Get the exact value for a state/county and dataset"""
    try:
        if is_county:
            query = f"""
                SELECT county_nam as county_name, state_name,
                       CASE 
                           WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                           THEN {dataset} * 100
                           ELSE {dataset}
                       END as value
                FROM county
                WHERE LOWER(county_nam) LIKE LOWER(?) || '%'
            """
        else:
            query = f"""
                SELECT state_name,
                       CASE 
                           WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                           THEN {dataset} * 100
                           ELSE {dataset}
                       END as value
                FROM state
                WHERE LOWER(state_name) = LOWER(?)
            """
        
        result = con.execute(query, [state_or_county_name]).fetchone()
        if not result:
            return None
            
        metric_info = get_metric_info(dataset)
        
        if is_county:
            county, state, value = result
            
            if not metric_info['is_percentage']:
                return {
                    'result': f"{county} County in {state} has {value:.2f} {metric_info['unit']}.",
                    'county': county,
                    'state': state
                }
            else:
                # Handle different percentage datasets
                if dataset in ['walk_to_wo', 'transit_to']:
                    return {
                        'result': f"{county} County in {state} has {value:.2f}{metric_info['unit']} of people who {metric_info.get('verb', 'commute')} to work.",
                        'county': county,
                        'state': state
                    }
                elif dataset == 'pct_tot_co':
                    return {
                        'result': f"{county} County in {state} has {value:.2f}{metric_info['unit']} priority population.",
                        'county': county,
                        'state': state
                    }
                elif dataset == 'pct_no_bb_':
                    return {
                        'result': f"{county} County in {state} has {value:.2f}{metric_info['unit']} of people lacking broadband or computer access.",
                        'county': county,
                        'state': state
                    }
                else:
                    return {
                        'result': f"{county} County in {state} has {value:.2f}{metric_info['unit']} {metric_info['name']}.",
                        'county': county,
                        'state': state
                    }
        else:
            state, value = result
            
            if not metric_info['is_percentage']:
                return {
                    'result': f"{state} has {value:.2f} {metric_info['unit']}.",
                    'state': state
                }
            else:
                # Handle different percentage datasets
                if dataset in ['walk_to_wo', 'transit_to']:
                    return {
                        'result': f"{state} has {value:.2f}{metric_info['unit']} of people who {metric_info.get('verb', 'commute')} to work.",
                        'state': state
                    }
                elif dataset == 'pct_tot_co':
                    return {
                        'result': f"{state} has {value:.2f}{metric_info['unit']} priority population.",
                        'state': state
                    }
                elif dataset == 'pct_no_bb_':
                    return {
                        'result': f"{state} has {value:.2f}{metric_info['unit']} of people lacking broadband or computer access.",
                        'state': state
                    }
                else:
                    return {
                        'result': f"{state} has {value:.2f}{metric_info['unit']} {metric_info['name']}.",
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
                   CASE 
                       WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                       THEN {dataset} * 100
                       ELSE {dataset}
                   END as value
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
def get_extrema(question, dataset):
    """Get highest or lowest value based on question"""
    try:
        is_highest = any(word in question.lower() for word in ["highest", "most", "largest", "greatest"])
        
        query = f"""
            SELECT state_name, 
                   CASE 
                       WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                       THEN {dataset} * 100
                       ELSE {dataset}
                   END as value
            FROM state
            ORDER BY value {'DESC' if is_highest else 'ASC'}
            LIMIT 1
        """
        
        result = con.execute(query).fetchone()
        if not result:
            return None
            
        metric_info = get_metric_info(dataset)
        
        unit = 'people per square mile' if dataset == 'ppl_densit' else '%'
        
        # Remove space before % symbol
        value_str = f"{result[1]:.2f}{unit}" if unit == '%' else f"{result[1]:.2f} {unit}"
        
        return {
            'result': f"{result[0]} has the {'highest' if is_highest else 'lowest'} {metric_info['name']} of {value_str}.",
            'state': result[0]  # Include the state name in response
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
                CASE 
                    WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                    THEN {dataset} * 100
                    ELSE {dataset}
                END
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
        Return just the number, or '50' if not specified."""
        
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
def get_moran_i(dataset):
    """Analyze global spatial pattern using Moran's I"""
    try:
        # Get state geometries and data for the specified dataset
        query = f"""
            SELECT state_name, {dataset} as value, ST_AsText(geom) as geometry
            FROM state
        """
        result = con.execute(query).fetchdf()
        
        # Convert to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            result, 
            geometry=gpd.GeoSeries.from_wkt(result['geometry'])
        )
        
        # Create spatial weights matrix using KNN
        w = KNN.from_dataframe(gdf, k=10)
        w.transform = 'r'  # Row-standardize weights
        
        # Calculate global Moran's I
        moran = Moran(gdf['value'], w)
        
        # Interpret the results and provide simple response
        if moran.p_sim < 0.05:  # Statistically significant
            if moran.I > 0:
                response = {
                    'pattern': 'clustered',
                    'description': 'Yes, there is a clustered pattern in the map, similar values tend to be located near each other.'
                }
            else:
                response = {
                    'pattern': 'dispersed',
                    'description': 'Yes, there is a dispersed pattern in the map, dissimilar values tend to be located near each other.'
                }
        else:
            response = {
                'pattern': 'random',
                'description': 'No, there is no obvious spatial pattern in this map.'
            }
        
        return response
        
    except Exception as e:
        print(f"Error analyzing global pattern: {str(e)}")
        return None

#09_describe_pattern
def get_lisa_clusters(dataset):
    """Analyze spatial patterns using Local Moran's I and return cluster classifications"""
    try:
        # Get state geometries and data for the specified dataset
        query = f"""
            SELECT state_name, 
                   CASE 
                       WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                       THEN {dataset} * 100  -- Multiply percentages by 100
                       ELSE {dataset}
                   END as value,
                   ST_AsText(geom) as geometry
            FROM state
        """
        result = con.execute(query).fetchdf()
        
        # Convert to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            result, 
            geometry=gpd.GeoSeries.from_wkt(result['geometry'])
        )
        
        # Create spatial weights matrix using KNN
        w = KNN.from_dataframe(gdf, k=10)
        w.transform = 'r'  # Normalize weights
        
        # Calculate local Moran's I
        moran = Moran_Local(gdf['value'], w, permutations=999)
        
        # Add LISA statistics to the dataframe
        gdf['LISA_P'] = moran.p_sim
        
        # Assign cluster categories where p < 0.05
        significant = gdf['LISA_P'] < 0.05
        
        # Create lists of states in each category
        hh_states = gdf[significant & (moran.q == 1)]['state_name'].tolist()
        lh_states = gdf[significant & (moran.q == 2)]['state_name'].tolist()
        ll_states = gdf[significant & (moran.q == 3)]['state_name'].tolist()
        hl_states = gdf[significant & (moran.q == 4)]['state_name'].tolist()
        
        return {
            'HH': hh_states,
            'LL': ll_states,
            'HL': hl_states,
            'LH': lh_states
        }
        
    except Exception as e:
        print(f"Error analyzing spatial patterns: {str(e)}")
        return None
        
def get_gpt_spatial_pattern_summary(lisa_clusters, dataset):
    """Get a natural language summary of spatial patterns using GPT"""
    try:
        metric_info = get_metric_info(dataset)
        metric_name = metric_info['name']

        # Create description from LISA clusters
        description = []
        if lisa_clusters['HH']:
            description.append(f"High-High clusters (states with high {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(lisa_clusters['HH'])}")
        if lisa_clusters['LL']:
            description.append(f"Low-Low clusters (states with low {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(lisa_clusters['LL'])}")
        if lisa_clusters['HL']:
            description.append(f"High-Low outliers (states with high {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(lisa_clusters['HL'])}")
        if lisa_clusters['LH']:
            description.append(f"Low-High outliers (states with low {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(lisa_clusters['LH'])}")
        
        raw_description = '. '.join(description)
        
        prompt = f"""
        Summarize the following US {metric_name} patterns in a single, concise paragraph following this structure:
        1. First mention high-value clusters with 1-2 example states
        2. Then mention low-value clusters with 1-2 example states
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
                    "content": """You are a spatial analysis expert who provides concise summaries for the general public. 
                    Focus on the most significant patterns and use clear geographic references. 
                    Keep responses to within 50 words and always include example states.
                    Pick examples that makes the most sense for the metric."""
                },
                {"role": "user", "content": prompt}
            ]
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        print(f"Error getting GPT summary: {str(e)}")
        return None

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
        
        # Create a contingency table for chi-square test
        # Reshape the data into a contingency table format
        contingency_table = result.pivot(index='rural', columns='main_fuel', values='count').fillna(0)
        
        # Check if we have both rural and non-rural counties
        if 'Rural' not in contingency_table.index or 'Not rural' not in contingency_table.index:
            return f"I couldn't compare urban and rural counties in {state_name} because there aren't enough counties of both types."
        
        # Perform chi-square test
        chi2, p_value, dof, expected = chi2_contingency(contingency_table)
        
        # Format the results
        rural_predominant = contingency_table.loc['Rural'].idxmax()
        urban_predominant = contingency_table.loc['Not rural'].idxmax()
        
        # Calculate percentages
        urban_total = contingency_table.loc['Not rural'].sum()
        rural_total = contingency_table.loc['Rural'].sum()
        
        urban_percentages = (contingency_table.loc['Not rural'] / urban_total * 100).round(1)
        rural_percentages = (contingency_table.loc['Rural'] / rural_total * 100).round(1)
        
        # Prepare the response
        if p_value < 0.05:
            significance = "There is a statistically significant difference"
        else:
            significance = "There is no statistically significant difference"
            
        # Include state name in the response
        state_phrase = f" in {state_name}" if state_name else ""
        response = f"{significance} between urban and rural counties regarding their predominant heating fuels{state_phrase}.\n\n"

        if urban_predominant == rural_predominant:
            response += f"Both urban and rural counties predominantly use {urban_predominant} heating in {state_name}."
        else:
            response += f"Urban counties predominantly use {urban_predominant} heating ({urban_percentages[urban_predominant]}%), "
            response += f"while rural counties predominantly use {rural_predominant} heating ({rural_percentages[rural_predominant]}%).\n\n"
        
        return response
        
    except Exception as e:
        print(f"Error comparing urban and rural heating fuels: {str(e)}")
        state_phrase = f" in {state_name}" if state_name else ""
        return f"I couldn't analyze the difference between urban and rural counties{state_phrase} due to a technical issue."

