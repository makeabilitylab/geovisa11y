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
    query = f"""
    SELECT GEOID, state_name, {value_column}, ST_AsText(ST_Simplify(geom, {accuracy})) AS geom_wkt
    FROM {table_name}
    """
    query_result = con.execute(query).fetchdf()
    gdf = gpd.GeoDataFrame(query_result, geometry=gpd.GeoSeries.from_wkt(query_result['geom_wkt']))
    
    # Add LISA classifications
    lisa_results = analyze_spatial_patterns()
    if lisa_results:
        # Create a mapping of state names to their LISA classification
        lisa_mapping = {}
        for state in lisa_results['HH']:
            lisa_mapping[state] = 'HH'
        for state in lisa_results['LL']:
            lisa_mapping[state] = 'LL'
        for state in lisa_results['HL']:
            lisa_mapping[state] = 'HL'
        for state in lisa_results['LH']:
            lisa_mapping[state] = 'LH'
        
        # Add LISA classification to GeoDataFrame
        gdf['lisa_class'] = gdf['state_name'].map(lisa_mapping)
    
    gdf.drop(columns=['geom_wkt'], inplace=True)
    geojson_data = json.loads(gdf.to_json())
    return jsonify(geojson_data)

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

def get_gpt_summary(spatial_pattern_text):
    """Get a more natural summary of the spatial patterns using GPT"""
    try:
        openai.api_key = DevelopmentConfig.OPENAI_API_KEY
        
        prompt = f"""
        Summarize the following US population density patterns in a single, concise paragraph following this structure:
        1. First mention high-density clusters with 1-2 example states
        2. Then mention low-density clusters with 1-2 example states
        3. Finally, mention any notable outliers (high density areas surrounded by low density or vice versa)
        
        Keep the summary brief and focused on the most significant patterns.
        
        Raw analysis:
        {spatial_pattern_text}
        """
        
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

def analyze_spatial_patterns():
    """Analyze spatial patterns using Local Moran's I"""
    try:
        # Get state geometries and population density data
        query = """
            SELECT state_name, ppl_densit as density, ST_AsText(geom) as geometry
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
        # Normalize the weights
        w.transform = 'r'
        
        # Calculate local Moran's I
        moran = Moran_Local(gdf['density'], w, permutations=999)
        
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
        if hh_states:
            description.append(f"High-High clusters (states with high density surrounded by high-density neighbors): {', '.join(hh_states)}")
        if ll_states:
            description.append(f"Low-Low clusters (states with low density surrounded by low-density neighbors): {', '.join(ll_states)}")
        if hl_states:
            description.append(f"High-Low outliers (states with high density surrounded by low-density neighbors): {', '.join(hl_states)}")
        if lh_states:
            description.append(f"Low-High outliers (states with low density surrounded by high-density neighbors): {', '.join(lh_states)}")
        
        raw_description = '. '.join(description)
        
        # Get GPT summary of the patterns
        gpt_summary = get_gpt_summary(raw_description)
        
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

def analyze_global_pattern():
    """Analyze global spatial pattern using Moran's I"""
    try:
        # Get state geometries and population density data
        query = """
            SELECT state_name, ppl_densit as density, ST_AsText(geom) as geometry
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
        moran = Moran(gdf['density'], w)
        
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

def analyze_population_density(question, selected_states=None):
    """Analyze population density data based on user question"""
    try:
        print(f"Analyzing question: {question}")
        print(f"Selected states: {selected_states}")
        
        question = question.lower()
        
        # Check for pattern analysis request
        if any(phrase in question for phrase in [
            "is there a pattern",
            "can you find a pattern",
            "do you see a pattern",
            "identify pattern",
            "detect pattern"
        ]):
            global_pattern = analyze_global_pattern()
            if global_pattern:
                return global_pattern['description']
            return None
            
        # Check for spatial pattern analysis request
        if any(phrase in question for phrase in [
            "spatial pattern",
            "spatial distribution",
            "clustering pattern",
            "density pattern",
            "density distribution"
        ]):
            spatial_analysis = analyze_spatial_patterns()
            if spatial_analysis:
                return spatial_analysis['description']
            return None
            
        # Get population density data from database
        query = f"""
            SELECT state_name, ppl_densit as density
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
            "population density of"
        ]):
            # If multiple states are selected
            if selected_states and len(selected_states) > 1:
                # Build density descriptions for each state
                descriptions = [
                    f"{r['state_name']} has a population density of {r['density']:.2f} people per square mile"
                    for r in results
                ]
                return f"{', '.join(descriptions)}."
            
            # For single state queries
            for state_data in results:
                state_name = state_data['state_name'].lower()
                if state_name in question.lower():
                    return f"{state_data['state_name']} has a population density of {state_data['density']:.2f} people per square mile."
            
            # If we have a single selected state but state wasn't found in question
            if selected_states and len(selected_states) == 1:
                state_data = results[0]  # Should only be one result
                return f"{state_data['state_name']} has a population density of {state_data['density']:.2f} people per square mile."
        
        # Handle highest/most dense questions
        if "highest" in question or "most densely" in question:
            highest = max(results, key=lambda x: x['density'])
            return f"{highest['state_name']} has the highest population density with {highest['density']:.2f} people per square mile."
            
        # Handle comparison questions
        if "compare" in question and len(results) > 1:
            descriptions = [
                f"{r['state_name']} has a population density of {r['density']:.2f} people per square mile" 
                for r in results
            ]
            sorted_results = sorted(results, key=lambda x: x['density'], reverse=True)
            return f"{', '.join(descriptions)}. {sorted_results[0]['state_name']} has the highest density and {sorted_results[-1]['state_name']} has the lowest density among the selected states."
        
        print("No matching question pattern found")
        return None
        
    except Exception as e:
        print(f"Error analyzing population density: {str(e)}")
        return None
