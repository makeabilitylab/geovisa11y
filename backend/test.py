from flask import Flask, jsonify
from flask_cors import CORS
import duckdb
import geopandas as gpd
from shapely import wkt
import json

app = Flask(__name__)
CORS(app)

# Initialize database connection with spatial extension
con = duckdb.connect('database/spatial-db.db', read_only=True)
con.execute("INSTALL spatial;")
con.execute("LOAD spatial;")

@app.route('/test')
def test():
    return {"message": "Hello World!"}

@app.route('/db-test')
def db_test():
    try:
        result = con.execute('SELECT COUNT(*) FROM state').fetchone()
        tables = con.execute('SHOW TABLES').fetchall()
        return jsonify({
            "message": "Database connection successful",
            "count": result[0],
            "available_tables": [table[0] for table in tables]
        })
    except Exception as e:
        return jsonify({
            "error": str(e),
            "type": str(type(e))
        }), 500

@app.route('/geojson/<value_column>')
def get_density_data(value_column):
    try:
        query = f"""
        SELECT GEOID, state_name, 
               CASE 
                   WHEN '{value_column}' IN ('walk_to_wo', 'transit_to')
                   THEN COALESCE({value_column}, 0) * 100
                   ELSE COALESCE({value_column}, 0)
               END as value,
               ST_AsText(geom) AS geom_wkt
        FROM state
        """
        query_result = con.execute(query).fetchdf()
        
        # Convert WKT to GeoDataFrame
        gdf = gpd.GeoDataFrame(
            query_result,
            geometry=query_result['geom_wkt'].apply(wkt.loads),
            crs="EPSG:4326"
        )
        
        # Drop the WKT column and convert to GeoJSON
        gdf = gdf.drop(columns=['geom_wkt'])
        geojson_data = json.loads(gdf.to_json())
        
        return jsonify(geojson_data)
    except Exception as e:
        return jsonify({
            "error": str(e),
            "type": str(type(e))
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000) 