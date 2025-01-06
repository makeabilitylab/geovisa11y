# services/data_service.py

import duckdb
import geopandas as gpd
import json
from flask import jsonify

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
    gdf.drop(columns=['geom_wkt'], inplace=True)
    geojson_data = json.loads(gdf.to_json())
    return jsonify(geojson_data)

# Add these functions to handle population density analysis

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

def analyze_population_density(question, selected_states=None):
    """Analyze population density data based on user question"""
    try:
        # Add debug logging
        print(f"Analyzing question: {question}")
        print(f"Selected states: {selected_states}")
        
        # Convert question to lowercase for easier matching
        question = question.lower()
        
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
