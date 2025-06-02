import duckdb

# Variables


# Define a centralized metric mapping dictionary with simplified structure
# The keys are a dataset
METRIC_MAPPING_SEMANTIC = {
    'ppl_densit': {
        'name': 'population density',
        'unit': 'people per square mile',
        'is_percentage': False
    },
    'pct_tot_co': {
        'name': 'underserved population percentage',
        'unit': '%',
        'is_percentage': True
    },
    'pct_no_bb_': {
        'name': 'percentage of people lacking broadband and computer access',
        'unit': '%',
        'is_percentage': True
    },
    'gas': {
        'name': 'number of households with gas heating',
        'unit': 'count',
        'is_percentage': False
    },
    'electricit': {
        'name': 'number of households with electric heating',
        'unit': 'count',
        'is_percentage': False
    },
    'oil': {
        'name': 'number of households with oil heating',
        'unit': 'count',
        'is_percentage': False
    },
    'pct_gas': {
        'name': 'percentage of households with gas heating',
        'unit': '%',
        'is_percentage': True
    },
    'pct_electr': {
        'name': 'percentage of households with electric heating',
        'unit': '%',
        'is_percentage': True
    },
    'pct_oil': {
        'name': 'percentage of households with oil heating',
        'unit': '%',
        'is_percentage': True
    }
}

'''
Parameters:
  DuckDB_Path (string): The path to the database to connect with
  read_only_flag (Boolean): A flag representing if all queries should be read
                            only or not
  DuckDB_Dependencies (List<String>): A list of dependiecies that can be install
  and loaded as apart of this database connection (EDIT IF NEEDED)

  Returns a duckdb.Connection that's already installed & loaded with the extensions
    listed in DUCKDB_EXTENSIONS. Uses DUCKDB_PATH and DUCKDB_READ_ONLY from above.
'''
def get_duckdb_connection(DuckDB_Path, read_only_flag, DuckDB_Dependencies):
    con = duckdb.connect(DuckDB_Path, read_only=read_only_flag)
    for ext in DuckDB_Dependencies:
        con.execute(f"INSTALL '{ext}';")
        con.execute(f"LOAD '{ext}';")
    return con

