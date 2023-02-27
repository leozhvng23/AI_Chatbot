import json
import os
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
from boto3.dynamodb.conditions import Key
from botocore.vendored import requests

# opensearch
REGION = "us-east-1"
HOST = "search-yelp-restaurants-ds6zskeeiwsmnwjmnrgk4dzyya.us-east-1.es.amazonaws.com"
INDEX = "restaurants"
# SQS
QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/739332760787/DiningSuggestions"

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
db = dynamodb.Table("yelp-restaurants")


def lambda_handler(event, context):
    sqs = boto3.client("sqs")
    ses = boto3.client("ses")

    while True:
        response = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            AttributeNames=["All"],
            MaxNumberOfMessages=5,
            MessageAttributeNames=["All"],
            VisibilityTimeout=30,
            WaitTimeSeconds=0,
        )

        print(response)
        messages = response.get("Messages", [])
        for message in messages:
            body = json.loads(message["Body"])
            cuisine = body["cuisine"]
            email = body["email"]
            people = body["people"]
            date = body["date"]
            time = body["time"]
            ids = queryOpensearch(cuisine)
            db_results = queryDynamo(ids)
            sqs.delete_message(
                QueueUrl=QUEUE_URL, ReceiptHandle=message["ReceiptHandle"]
            )
            response = ses.send_email(
                Source="zz2830@columbia.edu",
                Destination={"ToAddresses": [email]},
                Message={
                    "Subject": {"Data": "Dining Suggestions"},
                    "Body": {
                        "Text": {
                            "Data": createMessage(
                                db_results, cuisine, people, date, time
                            )
                        }
                    },
                },
            )
            print("response: \n", response)
        else:
            print("No messages in queue")
            break


def createMessage(db_results, cuisine, people, date, time):
    messages = ""
    messages += (
        "Hello! Here are my "
        + cuisine.capitalize()
        + " restaurant suggestions for "
        + people
        + " people, for "
        + date
        + " at "
        + time
        + ":"
        + "\n"
        + "\n"
    )
    for i in range(len(db_results)):
        messages += (
            str(i + 1)
            + ". "
            + db_results[i]["name"]
            + ", located at "
            + db_results[i]["address"][0]
            + " with a rating of "
            + str(db_results[i]["rating"])
            + " and "
            + str(db_results[i]["review_count"])
            + " reviews."
            + "\n"
        )
    messages += "\n" + "Enjoy your meal!"
    print(messages)
    return messages


def queryDynamo(ids):
    results = []
    for id in ids:
        response = db.query(KeyConditionExpression=Key("insertedAtTimestamp").eq(id))
        results.append(response["Items"][0])
    return results


def queryOpensearch(term):
    q = {"size": 5, "query": {"multi_match": {"query": term}}}

    client = OpenSearch(
        hosts=[{"host": HOST, "port": 443}],
        http_auth=get_awsauth(REGION, "es"),
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
    )

    search_result = client.search(index=INDEX, body=q)
    ids = []
    for hit in search_result["hits"]["hits"]:
        ids.append(hit["_source"]["insertedAtTimestamp"])

    return ids


def get_awsauth(region, service):
    cred = boto3.Session().get_credentials()
    return AWS4Auth(
        cred.access_key, cred.secret_key, region, service, session_token=cred.token
    )
