from opensearchpy import OpenSearch
import csv

# Connect to OpenSearch
opensearch = OpenSearch(
    hosts=[{"host": "search-yelp-restaurants-ds6zskeeiwsmnwjmnrgk4dzyya.us-east-1.es.amazonaws.com", "port": 443}],
    http_auth=("<master username>", "<password>"),
    use_ssl=True,
    verify_certs=True
)

response = opensearch.cat.indices()
print(response)

# wipe the index
response = opensearch.delete_by_query(
    index="restaurants",
    body={
        "query": {
            "match_all": {}
        }
    }
)
print(response)

# Define the mapping for the Restaurant type
mapping = {
    "properties": {
        "insertedAtTimestamp": {"type": "text"},
        "Cuisine": {"type": "text"}
    }
}

# Create the Restaurant type under the restaurants index
opensearch.indices.put_mapping(index="restaurants", body=mapping)

# Read the CSV file and index each restaurant
with open("manhattan_restaurants.csv", "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        restaurant = {
            "insertedAtTimestamp": row["insertedAtTimestamp"],
            "Cuisine": row["cuisine"],
        }
        opensearch.index(index="restaurants", body=restaurant)

