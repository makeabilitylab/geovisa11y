from flask import Flask, jsonify, request
from flask_cors import CORS
import duckdb
import geopandas as gpd
import json

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:3000"}})

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

@app.route('/geojson/population-density', methods=['GET'])
def population_density():
    accuracy = request.args.get("accuracy", default=0.01, type=float)
    return fetch_density_data('state', accuracy, "ppl_densit")


@app.after_request
def add_cors_headers(response):
    print(f"Response headers: {response.headers}")
    return response


if __name__ == '__main__':
    app.run(debug=True)