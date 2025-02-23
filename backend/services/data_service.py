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

# Initialize DuckDB connection
con = duckdb.connect('database/spatial-db.db', read_only=True)
con.execute("INSTALL 'spatial';")
con.execute("LOAD 'spatial';")

# Initialize the semantic service
semantic_service = SemanticService()

def fetch_density_data(table_name, accuracy, value_column='ppl_densit', state_filter=None):
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
               ST_AsText(ST_Simplify(geom, {accuracy})) AS geom_wkt
        FROM {table_name}
        {where_clause}
        """
        print(f"Executing query: {query}")  # Debug log
        
        query_result = con.execute(query).fetchdf()
        print(f"Query result shape: {query_result.shape}")  # Debug log
        print(f"Query result columns: {query_result.columns}")  # Debug log
        print(f"First few rows: {query_result.head()}")  # Debug log
        
        if query_result.empty:
            raise ValueError(f"No data found for state: {state_filter}")
            
        gdf = gpd.GeoDataFrame(query_result, geometry=gpd.GeoSeries.from_wkt(query_result['geom_wkt']))
        
        # Add LISA classifications
        lisa_results = analyze_spatial_patterns(value_column)  # Pass the current dataset
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
        
        # Keep the centroid coordinates and county name in the properties
        gdf['c_lon'] = query_result['c_lon']
        gdf['c_lat'] = query_result['c_lat']
        if 'county_name' in query_result.columns:
            gdf['county_name'] = query_result['county_name']
        
        gdf.drop(columns=['geom_wkt'], inplace=True)
        geojson_data = json.loads(gdf.to_json())
        
        # Debug log
        print(f"GeoJSON features count: {len(geojson_data['features'])}")
        if geojson_data['features']:
            print(f"Sample feature properties: {geojson_data['features'][0]['properties']}")
        
        return jsonify(geojson_data)
    except Exception as e:
        print(f"Error in fetch_density_data: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        raise  # Re-raise the exception to be caught by the route handler

#Question and answering functions
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

def get_gpt_summary(spatial_pattern_text, dataset='ppl_densit'):
    """Get a more natural summary of the spatial patterns using GPT"""
    try:
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'walking to work percentage',
            'transit_to': 'public transit usage'
        }.get(dataset, 'value')
        
        prompt = f"""
        Summarize the following US {metric_name} patterns in a single, concise paragraph following this structure:
        1. First mention high-value clusters with 1-2 example states
        2. Then mention low-value clusters with 1-2 example states
        3. Finally, mention any notable outliers (high values surrounded by low or vice versa)
        
        Keep the summary brief and focused on the most significant patterns.
        
        Raw analysis:
        {spatial_pattern_text}
        """
        
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        
        response = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system", 
                    "content": """You are a spatial analysis expert who provides concise summaries. 
                    Focus on the most significant patterns and use clear geographic references. 
                    Keep responses to a single paragraph and always include example states."""
                },
                {"role": "user", "content": prompt}
            ]
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        print(f"Error getting GPT summary: {str(e)}")
        return None

def analyze_spatial_patterns(dataset='ppl_densit'):
    """Analyze spatial patterns using Local Moran's I"""
    try:
        print(f"\n=== Spatial Pattern Analysis ===")
        print(f"Dataset: {dataset}")
        
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
        
        # Log the values we're analyzing
        print("\nSample of values being analyzed:")
        print(result[['state_name', 'value']].head())
        
        # Convert to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            result, 
            geometry=gpd.GeoSeries.from_wkt(result['geometry'])
        )
        
        # Create spatial weights matrix using KNN
        w = KNN.from_dataframe(gdf, k=10)
        # Normalize the weights
        w.transform = 'r'
        
        # Calculate local Moran's I
        moran = Moran_Local(gdf['value'], w, permutations=999)
        
        # Add LISA statistics to the dataframe
        gdf['LISA_I'] = moran.Is
        gdf['LISA_P'] = moran.p_sim
        gdf['LISA_CL'] = 0
        
        # Assign cluster categories where p < 0.05
        significant = gdf['LISA_P'] < 0.05
        gdf.loc[significant & (moran.q == 1), 'LISA_CL'] = 1  # High-High
        gdf.loc[significant & (moran.q == 2), 'LISA_CL'] = 2  # Low-High
        gdf.loc[significant & (moran.q == 3), 'LISA_CL'] = 3  # Low-Low
        gdf.loc[significant & (moran.q == 4), 'LISA_CL'] = 4  # High-Low
        
        # Create lists of states in each category
        hh_states = gdf[gdf['LISA_CL'] == 1]['state_name'].tolist()
        lh_states = gdf[gdf['LISA_CL'] == 2]['state_name'].tolist()
        ll_states = gdf[gdf['LISA_CL'] == 3]['state_name'].tolist()
        hl_states = gdf[gdf['LISA_CL'] == 4]['state_name'].tolist()
        
        # Create a human-readable description
        description = []
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'walking to work percentage',
            'transit_to': 'public transit usage'
        }.get(dataset, 'value')
        
        if hh_states:
            description.append(f"High-High clusters (states with high {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(hh_states)}")
        if ll_states:
            description.append(f"Low-Low clusters (states with low {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(ll_states)}")
        if hl_states:
            description.append(f"High-Low outliers (states with high {metric_name} surrounded by low-{metric_name} neighbors): {', '.join(hl_states)}")
        if lh_states:
            description.append(f"Low-High outliers (states with low {metric_name} surrounded by high-{metric_name} neighbors): {', '.join(lh_states)}")
        
        raw_description = '. '.join(description)
        
        # Get GPT summary of the patterns
        gpt_summary = get_gpt_summary(raw_description, dataset)
        
        # After creating the clusters, log them:
        print("\n=== LISA Clusters ===")
        print(f"High-High (HH) clusters: {hh_states}")
        print(f"Low-Low (LL) clusters: {ll_states}")
        print(f"High-Low (HL) outliers: {hl_states}")
        print(f"Low-High (LH) outliers: {lh_states}")
        
        # Also log some statistics about the values
        print("\n=== Value Statistics ===")
        print(f"Min value: {result['value'].min():.2f}")
        print(f"Max value: {result['value'].max():.2f}")
        print(f"Mean value: {result['value'].mean():.2f}")
        print("===============================\n")
        
        response = {
            'HH': hh_states,
            'LL': ll_states,
            'HL': hl_states,
            'LH': lh_states,
            'raw_description': raw_description,
            'description': gpt_summary if gpt_summary else raw_description
        }
        
        return response
        
    except Exception as e:
        print(f"Error analyzing spatial patterns: {str(e)}")
        return None

def analyze_global_pattern(dataset='ppl_densit'):
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

def analyze_state_data(question, dataset=None):
    """Analyze state-level data based on user question"""
    try:
        # Get data from database
        query = f"""
            SELECT state_name, 
                   CASE 
                       WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                       THEN {dataset} * 100
                       ELSE {dataset}
                   END as value
            FROM state
        """
            
        # Execute query and get results
        results = con.execute(query).fetchall()
        if not results:
            return None
            
        # Convert results to list of dictionaries
        results = [{'state_name': r[0], 'value': float(r[1])} for r in results]
        
        # Get metric name and unit
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'percentage of people walking to work',
            'transit_to': 'percentage of people using public transit'
        }[dataset]
        unit = 'people per square mile' if dataset == 'ppl_densit' else '%'

        # Handle simple value questions for specific states
        question_lower = question.lower()
        for state_data in results:
            state_name = state_data['state_name'].lower()
            if state_name in question_lower:
                value = float(state_data['value'])
                if dataset == 'ppl_densit':
                    return {
                        'result': f"{state_data['state_name']} has {value:.2f} {unit}.",
                        'state': state_data['state_name']  # Include state name in response
                    }
                else:
                    # More natural verbs for each transit type
                    verb_mapping = {
                        'walk_to_wo': 'walk',
                        'transit_to': 'take public transit'
                    }
                    verb = verb_mapping[dataset]
                    return {
                        'result': f"{state_data['state_name']} has {value:.2f}{unit} of people who {verb} to work.",
                        'state': state_data['state_name']  # Include state name in response
                    }
        
        # Handle average questions
        if any(word in question.lower() for word in ["average", "mean", "median", "typical"]):
            avg_value = sum(r['value'] for r in results) / len(results)
            return f"The average {metric_name} across all states is {avg_value:.2f} {unit}."
            
        # Handle highest/lowest questions
        if any(word in question.lower() for word in ["highest", "most", "largest", "greatest", "biggest"]):
            highest = max(results, key=lambda x: x['value'])
            value = highest['value']
            return f"{highest['state_name']} has the highest {metric_name} of {value:.2f} {unit}."
        elif any(word in question.lower() for word in ["lowest", "least", "smallest", "minimum", "minimal"]):
            lowest = min(results, key=lambda x: x['value'])
            value = lowest['value']
            return f"{lowest['state_name']} has the lowest {metric_name} of {value:.2f} {unit}."
        
        # If we get here, we couldn't handle the question
        return None

    except Exception as e:
        print(f"Error analyzing state data: {str(e)}")
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

def analyze_spatial_question(question, current_dataset='ppl_densit'):
    """Analyze spatial questions for any dataset"""
    try:
        question_type = semantic_service.identify_question_type(question, current_dataset)
        print(f"\nDebug - Identified question type: {question_type}")
        
        # Get metric details
        metric_name = semantic_service.dataset_terms[current_dataset]['metric']
        unit = semantic_service.dataset_terms[current_dataset]['unit']
        
        if question_type == 'retrieve':
            states = semantic_service.extract_states(question)
            if not states:
                return None
            result = analyze_state_data(question, current_dataset)
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
            result = get_average(current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'aggregate'
            }
            
        elif question_type == 'filter':
            result = filter_states(question, current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'filter'
            }
            
        elif question_type == 'sort':
            result = sort_states(question, current_dataset)
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
            result = find_similar_states(states[0], current_dataset)
            return {
                'result': result,
                'dataset': current_dataset,
                'question_type': 'cluster'
            }
            
        elif question_type == 'is_pattern':
            result = analyze_global_pattern(current_dataset)
            return {
                'result': result['description'],
                'dataset': current_dataset,
                'question_type': 'is_pattern'
            }
            
        elif question_type == 'describe_pattern':
            result = analyze_spatial_patterns(current_dataset)
            return {
                'result': format_lisa_results(result, current_dataset),
                'dataset': current_dataset,
                'question_type': 'describe_pattern'
            }
            
        elif question_type == 'find_outliers':
            result = analyze_spatial_patterns(current_dataset)
            outliers = format_outliers(result, current_dataset)
            return {
                'result': outliers,
                'dataset': current_dataset,
                'question_type': 'find_outliers'
            }
            
        elif question_type == 'correlate':
            return None
            
        elif question_type == 'others':
            return None

        return None

    except Exception as e:
        print(f"Error analyzing spatial question: {str(e)}")
        return None

def format_lisa_results(results, dataset):
    """Format LISA cluster results into a readable string with limited examples"""
    try:
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'walking to work',
            'transit_to': 'public transit usage'
        }.get(dataset, dataset)
        
        parts = []
        if results['HH']:
            # Take up to 2 examples from HH
            examples = results['HH'][:2]
            parts.append(f"High-{metric_name} clusters are found in states like {' and '.join(examples)}.")
        if results['LL']:
            # Take up to 2 examples from LL
            examples = results['LL'][:2]
            parts.append(f"Low-{metric_name} clusters are found in states like {' and '.join(examples)}.")
        if results['HL']:
            # Take up to 2 examples from HL
            examples = results['HL'][:2]
            parts.append(f"Interesting outliers with high {metric_name} surrounded by low values are found in states like {' and '.join(examples)}.")
        if results['LH']:
            # Take up to 2 examples from LH
            examples = results['LH'][:2]
            parts.append(f"Interesting outliers with low {metric_name} surrounded by high values are found in states like {' and '.join(examples)}.")
        
        return ' '.join(parts)
    except Exception as e:
        print(f"Error formatting LISA results: {str(e)}")
        return "Unable to format cluster results."

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
        print(f"Debug - Compare states results: {results}")
        if len(results) != 2:
            return None
            
        # Convert input state names to title case for matching
        state1 = state1.title()
        state2 = state2.title()
        
        state1_data = next(r for r in results if r[0].lower() == state1.lower())
        state2_data = next(r for r in results if r[0].lower() == state2.lower())
        
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'percentage of people walking to work',
            'transit_to': 'percentage of people using public transit'
        }[dataset]
        
        unit = 'people per square mile' if dataset == 'ppl_densit' else '%'
        
        # Determine which state has higher value
        higher_state = state1_data[0] if state1_data[1] > state2_data[1] else state2_data[0]
        lower_state = state2_data[0] if state1_data[1] > state2_data[1] else state1_data[0]
        
        return (
            f"{state1_data[0]} has {state1_data[1]:.2f} {unit} {metric_name} while "
            f"{state2_data[0]} has {state2_data[1]:.2f} {unit}. "
            f"{higher_state} has higher {metric_name} than {lower_state}."
        )
    except Exception as e:
        print(f"Error comparing states: {str(e)}")
        return None

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
            
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'percentage of people walking to work',
            'transit_to': 'percentage of people using public transit'
        }[dataset]
        
        unit = 'people per square mile' if dataset == 'ppl_densit' else '%'
        
        # Remove space before % symbol
        value_str = f"{result[1]:.2f}{unit}" if unit == '%' else f"{result[1]:.2f} {unit}"
        
        return {
            'result': f"{result[0]} has the {'highest' if is_highest else 'lowest'} {metric_name} of {value_str}.",
            'state': result[0]  # Include the state name in response
        }
    except Exception as e:
        print(f"Error getting extrema: {str(e)}")
        return None

def get_average(dataset):
    """Calculate average value across all states"""
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
            
        metric_name = {
            'ppl_densit': 'population density',
            'walk_to_wo': 'percentage of people walking to work',
            'transit_to': 'percentage of people using public transit'
        }[dataset]
        
        unit = 'people per square mile' if dataset == 'ppl_densit' else '%'
        
        return f"The average {metric_name} across all states is {result[0]:.2f} {unit}."
    except Exception as e:
        print(f"Error calculating average: {str(e)}")
        return None

def filter_states(question, dataset):
    """Filter states based on conditions"""
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
        metric_name = semantic_service.dataset_terms[dataset]['metric']
        return f"States with {metric_name} {operator} {value}: {', '.join(states)}"
        
    except Exception as e:
        print(f"Error in filter_states: {str(e)}")
        return None

def sort_states(question, dataset):
    """Sort states based on values"""
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
        metric_name = semantic_service.dataset_terms[dataset]['metric']
        unit = semantic_service.dataset_terms[dataset]['unit']
        
        formatted_results = [f"{i+1}. {r[0]} ({r[1]:.2f} {unit})" 
                           for i, r in enumerate(results)]
        return f"Top {limit} states by {metric_name}:\n" + "\n".join(formatted_results)
        
    except Exception as e:
        print(f"Error in sort_states: {str(e)}")
        return None

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
        metric_name = semantic_service.dataset_terms[dataset]['metric']
        unit = semantic_service.dataset_terms[dataset]['unit']
        
        return (f"The {metric_name} ranges from {result[0]:.2f} to {result[1]:.2f} {unit}, "
                f"with an average of {result[2]:.2f} {unit}.")
                
    except Exception as e:
        print(f"Error in get_data_range: {str(e)}")
        return None

def find_similar_states(state, dataset):
    """Find states with similar values"""
    try:
        # First get the value for the reference state
        query = f"""
            SELECT {dataset} as value
            FROM state
            WHERE state_name = ?
        """
        
        ref_value = con.execute(query, [state]).fetchone()[0]
        
        # Then find states within 10% of this value
        margin = ref_value * 0.1
        query = f"""
            SELECT state_name, {dataset} as value
            FROM state
            WHERE {dataset} BETWEEN ? AND ?
            AND state_name != ?
            ORDER BY ABS({dataset} - ?)
            LIMIT 5
        """
        
        results = con.execute(query, [ref_value - margin, ref_value + margin, 
                                    state, ref_value]).fetchall()
                                    
        metric_name = semantic_service.dataset_terms[dataset]['metric']
        unit = semantic_service.dataset_terms[dataset]['unit']
        
        if not results:
            return f"No states have similar {metric_name} to {state}."
            
        similar_states = [f"{r[0]} ({r[1]:.2f} {unit})" for r in results]
        return f"States with similar {metric_name} to {state}: " + ", ".join(similar_states)
        
    except Exception as e:
        print(f"Error in find_similar_states: {str(e)}")
        return None

def format_outliers(lisa_results, dataset):
    """Format outlier results from LISA analysis"""
    try:
        metric_name = semantic_service.dataset_terms[dataset]['metric']
        
        outliers = []
        if lisa_results['HL']:  # High-Low outliers
            outliers.extend([f"{state} (high {metric_name})" 
                           for state in lisa_results['HL']])
        if lisa_results['LH']:  # Low-High outliers
            outliers.extend([f"{state} (low {metric_name})" 
                           for state in lisa_results['LH']])
            
        if not outliers:
            return f"No significant outliers found in {metric_name}."
            
        return "Outlier states: " + ", ".join(outliers)
        
    except Exception as e:
        print(f"Error formatting outliers: {str(e)}")
        return None
