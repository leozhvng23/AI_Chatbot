import boto3
import datetime
import json
from botocore.vendored import requests
from decimal import *
from time import sleep

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
table = dynamodb.Table("yelp-restaurants")

API_KEY = "<API KEY>"
URL = "https://api.yelp.com/v3/businesses/search"

restaurantIds = set()

def lambda_handler(event, context):
    cuisines = [
            "chinese",
            "japanese",
            "korean",
            "thai",
            "vietnamese",
            "indian",
            "italian",
            "french",
            "american",
            "mediterranean",
        ]
    for cuisine in cuisines:
        offset = 0
        while offset < 1000:
            data = searchRequest(cuisine, offset)
            insertRestaurant(data["businesses"], cuisine)
            offset += 50

    return {"statusCode": 200, "body": json.dumps("Done!")}


def searchRequest(cuisine, offset):
    params = {
        "location": "Manhattan",
        "offset": offset,
        "limit": 50,
        "term": cuisine + " restaurants",
        "sort_by": "rating",
    }
    headers = {
        "Authorization": "Bearer " + API_KEY,
    }
    response = requests.request("GET", URL, headers=headers, params=params)
    return response.json()


def insertRestaurant(data, cuisine):
    global restaurantIds
    with table.batch_writer() as batch:
        for restaurant in data:
            try:
                # check for duplicates
                if restaurant["id"] in restaurantIds:
                    continue
                restaurantIds.add(restaurant["id"])
                restaurant["insertedAtTimestamp"] = str(datetime.datetime.now())
                restaurant["cuisine"] = cuisine
                # address format: [{"S":"7 Montgomery St"},{"S":"Jersey City, NJ 07302"}]
                restaurant["address"] = restaurant["location"]["display_address"]
                restaurant["coordinates"]["latitude"] = Decimal(
                    str(restaurant["coordinates"]["latitude"])
                )
                restaurant["coordinates"]["longitude"] = Decimal(
                    str(restaurant["coordinates"]["longitude"])
                )
                restaurant["rating"] = Decimal(str(restaurant["rating"]))
                restaurant.pop("location", None)
                restaurant.pop("distance", None)
                restaurant.pop("transactions", None)
                restaurant.pop("display_phone", None)
                restaurant.pop("categories", None)
                restaurant.pop("image_url", None)
                restaurant.pop("price", None)
                batch.put_item(Item=restaurant)
                sleep(0.001)
            except Exception as error:
                print(error)

# download dynamo db table as a csv file
