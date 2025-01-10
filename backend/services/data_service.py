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

# Initialize DuckDB connection
con = duckdb.connect('database/spatial-db.db', read_only=True)
con.execute("INSTALL 'spatial';")
con.execute("LOAD 'spatial';")

def fetch_density_data(table_name, accuracy, value_column='ppl_densit'):
    try:
        query = f"""
        SELECT GEOID, state_name, 
               CASE 
                   WHEN '{value_column}' IN ('walk_to_wo', 'transit_to')
                   THEN COALESCE({value_column}, 0) * 100  -- Multiply percentages by 100
                   ELSE COALESCE({value_column}, 0)
               END as value,
               ST_AsText(ST_Simplify(geom, {accuracy})) AS geom_wkt
        FROM {table_name}
        """
        print(f"Executing query: {query}")  # Debug log
        query_result = con.execute(query).fetchdf()
        print(f"Query result columns: {query_result.columns}")  # Debug log
        print(f"First few rows: {query_result.head()}")  # Debug log
        
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
        
        gdf.drop(columns=['geom_wkt'], inplace=True)
        geojson_data = json.loads(gdf.to_json())
        
        # Debug log
        print(f"GeoJSON properties for first feature: {geojson_data['features'][0]['properties']}")
        
        return jsonify(geojson_data)
    except Exception as e:
        print(f"Error in fetch_density_data: {str(e)}")
        return jsonify({'error': str(e)}), 500

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

def analyze_population_density(question, selected_states=None, dataset='ppl_densit'):
    """Analyze data based on user question"""
    try:
        print(f"Analyzing question: {question}")
        print(f"Selected states: {selected_states}")
        print(f"Current dataset: {dataset}")
        
        question = question.lower()
        
        # Set unit and context based on dataset
        dataset_info = {
            'ppl_densit': {
                'unit': 'people per square mile',
                'context': '',
                'is_percentage': False
            },
            'walk_to_wo': {
                'unit': 'percent',
                'context': 'of people who walk to work',
                'is_percentage': True
            },
            'transit_to': {
                'unit': 'percent',
                'context': 'of people who commute by public transit',
                'is_percentage': True
            }
        }
        
        unit = dataset_info[dataset]['unit']
        context = dataset_info[dataset]['context']
        is_percentage = dataset_info[dataset]['is_percentage']
        
        # Override dataset only if explicitly mentioned in question
        if ('walk' in question or 'walking' in question) and 'pattern' not in question:
            dataset = 'walk_to_wo'
            unit = 'percent'
            is_percentage = True
        elif ('transit' in question or 'public transport' in question) and 'pattern' not in question:
            dataset = 'transit_to'
            unit = 'percent'
            is_percentage = True
            
        # Check for pattern analysis request
        if any(phrase in question for phrase in [
            "spatial pattern",
            "spatial distribution",
            "clustering pattern",
            "density pattern",
            "density distribution"
        ]):
            spatial_analysis = analyze_spatial_patterns(dataset)
            if spatial_analysis:
                return spatial_analysis['description']
            return None
            
        # Check for pattern analysis request
        if any(phrase in question for phrase in [
            "is there a pattern",
            "can you find a pattern",
            "do you see a pattern",
            "identify pattern",
            "detect pattern"
        ]):
            global_pattern = analyze_global_pattern(dataset)
            if global_pattern:
                return global_pattern['description']
            return None
            
        # Get population density data from database
        query = f"""
            SELECT state_name, 
                   CASE 
                       WHEN '{dataset}' IN ('walk_to_wo', 'transit_to')
                       THEN {dataset} * 100  -- Multiply percentages by 100
                       ELSE {dataset}
                   END as value
            FROM state
        """
        
        # If specific states are selected, filter for those
        if selected_states:
            state_list = ', '.join([f"'{state}'" for state in selected_states])
            query += f" WHERE state_name IN ({state_list})"
        
        # Add debug logging for query
        print(f"Executing query: {query}")
            
        # Execute query and get results
        results = execute_query(query)
        print(f"Query results: {results}")
        
        if not results:
            print("No results from query")
            return None
            
        # Handle different types of questions
        if any(phrase in question for phrase in [
            "what's the population density of",
            "what is the population density of",
            "how dense is",
            "population density of",
            "what's the percentage",
            "what is the percentage",
            "how many people",
            "what percent",
            "percentage of"
        ]):
            # If multiple states are selected
            if selected_states and len(selected_states) > 1:
                descriptions = [
                    f"{r['state_name']} has {float(r['value']):.2f} {unit} {context}"
                    for r in results
                ]
                return f"{', '.join(descriptions)}."
            
            # For single state queries
            for state_data in results:
                state_name = state_data['state_name'].lower()
                if state_name in question.lower():
                    value = float(state_data['value'])
                    return f"{state_data['state_name']} has {value:.2f} {unit} {context}."
            
            # If we have a single selected state but state wasn't found in question
            if selected_states and len(selected_states) == 1:
                state_data = results[0]
                value = float(state_data['value'])
                return f"{state_data['state_name']} has {value:.2f} {unit} {context}."
        
        # Handle highest questions
        if any(word in question for word in ["highest", "most", "largest", "greatest", "biggest"]):
            highest = max(results, key=lambda x: x['value'])
            metric_name = {
                'ppl_densit': 'population density',
                'walk_to_wo': 'percentage of people walking to work',
                'transit_to': 'percentage of people using public transit'
            }[dataset]
            value = highest['value'] * 100 if is_percentage else highest['value']
            return f"{highest['state_name']} has the highest {metric_name} with {value:.2f} {unit}."
            
        # Handle comparison questions
        if any(word in question.lower() for word in ["compare", "which", "higher", "lower", "vs", "versus"]):
            if len(results) > 1:
                # Sort results by value in descending order
                sorted_results = sorted(results, key=lambda x: x['value'], reverse=True)
                descriptions = [
                    f"{r['state_name']} has {float(r['value']):.2f} {unit} {context}"
                    for r in sorted_results
                ]
                
                # Define metric name based on dataset
                metric_name = {
                    'ppl_densit': 'population density',
                    'walk_to_wo': 'percentage of people who walk to work',
                    'transit_to': 'percentage of people who use public transit'
                }.get(dataset, 'value')
                
                # Add comparison conclusion
                conclusion = f"{sorted_results[0]['state_name']} has a higher {metric_name} than {sorted_results[-1]['state_name']}"
                
                return f"{', '.join(descriptions)}. {conclusion}."
        
        print("No matching question pattern found")
        return None
        
    except Exception as e:
        print(f"Error analyzing population density: {str(e)}")
        return None
