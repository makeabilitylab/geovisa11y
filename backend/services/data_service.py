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
