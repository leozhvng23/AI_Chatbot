// Purpose: Lambda functions for the Lex bot
// reference: https://docs.aws.amazon.com/lexv2/latest/dg/using-spelling.html
import * as AWS_SQS from "@aws-sdk/client-sqs";
const sqs = new AWS_SQS.SQS({ region: "us-east-1" });

const locations = [
	"new york",
    "manhattan",
    "nyc",
];

const cuisines = [
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
];

const slotNames = ["location", "cuisine", "date", "time", "people", "email"];

const slotPrompts = {
	location: "What city would you like to dine in?",
	cuisine: "What cuisine would you like to try?",
	date: "What date would you like to dine on?",
	time: "What time would you like to dine at?",
	people: "How many people are in your party?",
	email: "Great. Lastly, I'll need your email so I can send you my recommendations.",
};

const greetingMsg = "Hi there, how can I help?";
const thankYouMsg = "You're welcome!";

export const handler = async (event, context, callback) => {
	const sessionState = event.sessionState || {};
	const sessionAttributes = sessionState.sessionAttributes || {};
	const intent = sessionState.intent;
	const intentName = intent.name;
	console.log(`intentName=${intentName}`);

	switch (intentName) {
		case "GreetingIntent":
			callback(null, elicitIntent(sessionAttributes, greetingMsg));
			break;
		case "ThankYouIntent":
			callback(null, elicitIntent(sessionAttributes, thankYouMsg));
			break;
		case "DiningSuggestionsIntent":
			let slots = getSlots(event);
			if (event.invocationSource === "DialogCodeHook") {
				const validationResult = validate_dining_suggestions(slots);
				if (!validationResult.isValid) {
					console.log("not valid input");
					slots[`${validationResult.violatedSlot}`] = null;
					callback(
						null,
						elicitSlot(
							sessionAttributes,
							intentName,
							slots,
							validationResult.violatedSlot,
							validationResult.message
						)
					);
					return;
				}
				// check if there are more slots to elicit
				let nextSlotToElicit = getSlotToElicit(slots);
				console.log("next slot: " + nextSlotToElicit);
				if (nextSlotToElicit) {
					callback(
						null,
						elicitSlot(
							sessionAttributes,
							intentName,
							slots,
							nextSlotToElicit,
							{
								contentType: "PlainText",
								content: slotPrompts[nextSlotToElicit],
							}
						)
					);
					return;
				}
			}

			// send message to queue
			const msg = {
				email: slots.email.value.resolvedValues[0],
				date: slots.date.value.originalValue,
				cuisine: slots.cuisine.value.resolvedValues[0],
				time: slots.time.value.originalValue,
				people: slots.people.value.originalValue,
			};
			let response = await sqs.sendMessage({
				QueueUrl:
					"https://sqs.us-east-1.amazonaws.com/739332760787/DiningSuggestions",
				MessageBody: JSON.stringify(msg),
			});
			console.log(response);

			callback(
				null,
				close(event, sessionAttributes, "Fulfilled", {
					contentType: "PlainText",
					content: `You're all set. Expect my suggestions shortly! Have a good day.`,
				})
			);
			break;
		default:
			callback(
				null,
				elicitIntent(
					sessionAttributes,
					"Sorry, I didn't get that. Can you try again?"
				)
			);
	}
};

let isValidDate = (date) => {
	// after today
	const options = {
		timeZone: "America/New_York",
	};
	// 12:00 AM EST
	const estTimeStr = new Date().toLocaleString("en-US", options);
	const estTime = new Date(estTimeStr);
	const today = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
	const dateObj = new Date(date);
	const isValid = dateObj >= today;

	return (
		date &&
		date.match(/^\d{4}-\d{2}-\d{2}$/) && // YYYY-MM-DD
		isValid
	);
};

let isValidTime = (date, time) => {
	const dateTimeStr = `${date} ${time}`;
	const dateTime = new Date(dateTimeStr);
	const options = {
		timeZone: "America/New_York",
	};
	const estTimeStr = new Date().toLocaleString("en-US", options);
	const estTime = new Date(estTimeStr);
	// Check if dateTime is in the future relative to estTime
	return dateTime > estTime;
};

let validate_dining_suggestions = (slots) => {
	const [location, cuisine, date, time, people, email] = [
		slots.location,
		slots.cuisine,
		slots.date,
		slots.time,
		slots.people,
		slots.email,
	];
	if (location) {
		if (location.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"location",
				`I'm sorry, I didn't get that. What city would you like to dine in?`
			);
		}
		if (!locations.includes(location.value.resolvedValues[0].toLowerCase())) {
			return buildValidationResult(
				false,
				"location",
				`We currently do not support ${location.value.originalValue}, would you like a different location?`
			);
		}
	}
	if (cuisine) {
		if (cuisine.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"cuisine",
				`I'm sorry, I didn't get that. What cuisine would you like to try?`
			);
		}
		if (!cuisines.includes(cuisine.value.resolvedValues[0].toLowerCase())) {
			return buildValidationResult(
				false,
				"cuisine",
				`We currently do not support ${cuisine.value.originalValue}, would you like a different cuisine?`
			);
		}
	}

	if (date) {
		if (date.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"date",
				"I'm sorry, I didn't get that. What date would you like to dine?"
			);
		}
		if (!isValidDate(date.value.resolvedValues[0])) {
			return buildValidationResult(
				false,
				"date",
				"The date you entered in invalid, please try again."
			);
		}
	}
	if (time) {
		if (time.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"time",
				"I'm sorry, I didn't get that. What time would you like to dine?"
			);
		}
		if (!isValidTime(date.value.resolvedValues[0], time.value.resolvedValues[0])) {
			return buildValidationResult(
				false,
				"time",
				"The time you entered in invalid, please try again. What time would you like to dine at?"
			);
		}
	}
	if (people) {
		if (people.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"people",
				"I'm sorry, I didn't get that. How many people are in your party?"
			);
		}
		if (parseInt(people.value.resolvedValues[0]) > 20) {
			return buildValidationResult(
				false,
				"people",
				"We currently only support parties of 20 or less. Please try again."
			);
		}
	}
	if (email) {
		if (email.value.resolvedValues.length < 1) {
			return buildValidationResult(
				false,
				"email",
				"I'm sorry, I didn't get that. What is your email?"
			);
		}
		if (!email.value.resolvedValues[0].match(/.+@.+\..+/)) {
			return buildValidationResult(
				false,
				"email",
				"Please enter a valid email address."
			);
		}
	}
	return buildValidationResult(true, null, null);
};

let buildValidationResult = (isValid, violatedSlot, messageContent) => {
	return {
		isValid: isValid,
		violatedSlot: violatedSlot,
		message: { contentType: "PlainText", content: messageContent },
	};
};


let getSlots = (event) => {
	return event.sessionState.intent.slots;
};


let getSlotToElicit = (slots) => {
	for (let slotName of slotNames) {
		if (!slots[slotName]) {
			return slotName;
		}
	}
};


let elicitSlot = (sessionAttributes, intentName, slots, slotToElicit, message) => {
	return {
		sessionState: {
			sessionAttributes: sessionAttributes,
			intent: {
				name: intentName,
				slots: slots,
			},
			dialogAction: {
				type: "ElicitSlot",
				slotToElicit: slotToElicit,
			},
		},
		messages: [message],
	};
};


let elicitIntent = (sessionAttributes, message) => {
	return {
		sessionState: {
			sessionAttributes: sessionAttributes,
			dialogAction: {
				type: "ElicitIntent",
			},
		},
		messages: [
			{
				contentType: "PlainText",
				content: message,
			},
		],
	};
};


let close = (event, sessionAttributes, fulfillmentState, message) => {
	event.sessionState.intent.state = fulfillmentState;
	return {
		sessionState: {
			sessionAttributes: sessionAttributes,
			dialogAction: {
				type: "Close",
			},
			intent: event.sessionState.intent,
		},
		messages: [message],
		sessionId: event.sessionId,
	};
};


