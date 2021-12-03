// This script implements a simple collaborative text block-listing bot
// for matrix using the matrix bot SDK.
import {
    PantalaimonClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin,
} from "matrix-bot-sdk";

import {writeFileSync, readFileSync} from "fs";
import {load} from "js-yaml";

const CONFIG_PATH = "config.yaml";
const BLOCKLIST_PATH = "blocklist.json";

const storage = new SimpleFsStorageProvider("bot.json");

// Read in credentials from config file
let username = "";
let password = "";
try {
    let configObj = load(readFileSync(CONFIG_PATH, "utf8"));
    username = configObj["username"];
    password = configObj["password"];
    console.log(`[DEBUG] The username is ${username} and the password is ${password}`);
} catch (e) {
    console.log("Error reading file: " + e)
}
const pantalaimon = new PantalaimonClient("http://0.0.0.0:8008", storage);
const client = await pantalaimon.createClientWithCredentials(username, password);

const NUM_PARTICIPANTS = 2;

const VoteState = {
    PASSED: "PASSED",
    NOT_PASSED: "NOT_PASSED",
    PENDING: "PENDING"
};

const homeserverUrl = ""; // make sure to update this with your url
const BOT_ACCOUNT = "";


// Commands for interacting with the block-list
const BLOCKLIST_ADD = "<blocklist add> ";
const BLOCKLIST_REMOVE = "<blocklist remove> ";
const BLOCKLIST_DISPLAY = "<blocklist display>";
// Definition of string constants
const VOTE_PROMPT =
`
Hey, you proposed a change that requires a vote!
React to this message with a 👍️ to vote in favor or with a 👎️ to vote against.
If a majority of participants vote in favor, the change will go through.
`;

const CHANGE_PASSED = "The proposed change has passed!"
const CHANGE_NOT_PASSED = "The proposed change did not pass"

const CONTENT_WARNING = "This message contains text on the block-list."

/**
 * An object that manages the state of an in-progress vote
 */
class Vote {
    /**
     * Constructor
     * @param {number} numParticipants The number of participants in the
     * room (currently, this is hard-coded)
     * @param {string} roomId The room identifier as a string. This
     * parameter is necessary for communicating the results of votes.
     * @param {string} voteEventId The eventId of the message where reaction
     * votes are being collected
     * @param {function} proposedChange A lambda function that will execute
     * if the vote passes.
     */
    constructor(numParticipants, roomId, voteEventId, proposedChange) {
        this.numParticipants = numParticipants;
        this.numVotesInFavor = 0;
        this.numVotesCast = 0;
        this.roomId = roomId
        this.voteEventId = voteEventId;
        this.proposedChange = proposedChange;
    }

    /**
     * Executes the appropriate state changes when someone votes in favor
     * of the proposed change.
     */
    voteInFavor() {
        this.numVotesCast++;
        this.numVotesInFavor++;
    }

    /**
     * Executes the appopriate state changes when someone votes against the
     * proposed change.
     */
    voteAgainst() {
        this.numVotesCast++;
    }

    /**
     * Checks the result of vote.
     * This function has side-effects! If the vote passes, the proposed
     * change will execute.
     * @returns The state of the vote
     */
    checkResult() {
        if (this.numVotesCast < this.numParticipants) {
            return VoteState.PENDING;
        }
        if (this.numVotesInFavor >= this.numParticipants/2) {
            this.proposedChange();
            clientSendMessage(this.roomId, CHANGE_PASSED);
            return VoteState.PASSED;
        } else {
            clientSendMessage(this.roomId, CHANGE_NOT_PASSED);
            return VoteState.NOT_PASSED;
        }
    }
}

let currentVote = null;
let contentBlocklist = [];

try {
    contentBlocklist = JSON.parse(readFileSync(BLOCKLIST_PATH, "utf8"))["content"];
} catch (e) {
    console.log("Error reading file: " + e)
}


AutojoinRoomsMixin.setupOnClient(client);
client.start().then(() => console.log("Client started!"));

/**
 * Sends `message` in the room with ID `roomId`.
 * @param {string} roomId The ID of the room as a string.
 * @param {string} message The message to send
 * @returns The event information associated with the sent message
 */
async function clientSendMessage(roomId, message) {
    return client.sendMessage(roomId, {
        "msgtype": "m.notice",
        "body": message,
    });
}

/**
 * Records the content block-list to the *.json file on disk.
 */
function writeBlocklist() {
    try {
        let updatedBlocklist = {"content": contentBlocklist};
        writeFileSync(BLOCKLIST_PATH, JSON.stringify(updatedBlocklist));
    } catch (e) {
        console.log("Error writing file: " + e)
    }
}

/**
 * Handler function for messages. Checks for control messages for viewing
 * and updating the content block-list. These control messages are as follows:
 * - `<blocklist display>`: prints out the current contents of the block-list
 * - `<blocklist add> text`: adds text to the block-list
 * - `<blocklist remove> text`: removes text from the block-list
 *
 * Also checks for text on the block-list. A warning message will be displayed
 * if any text in the block-list appears in the message.
 * @param {string} roomId String identifier of room.
 * @param {object} event JSON object associated with current message
 * @returns Nothing
 */
async function handleMessage(roomId, event) {
    if (! event["content"] || event["sender"] === BOT_ACCOUNT) return;
    const body = event["content"]["body"];

    // Check for a proposed change to the content block-list
    if (body === BLOCKLIST_DISPLAY) {
        clientSendMessage(roomId, JSON.stringify(contentBlocklist));
    } else if (body.startsWith(BLOCKLIST_ADD)) {
        if (currentVote !== null) {
            clientSendMessage(roomId, "Only one in progress vote at a time.");
            return;
        }
        let pollEventId = await clientSendMessage(roomId, VOTE_PROMPT);
        currentVote = new Vote(NUM_PARTICIPANTS, roomId, pollEventId, () => {
            let entry = body.substring(BLOCKLIST_ADD.length).trim();
            contentBlocklist.push(entry);
            writeBlocklist();
        });
        return;
    } else if (body.startsWith(BLOCKLIST_REMOVE)) {
        if (currentVote !== null) {
            clientSendMessage(roomId, "Only one in progress vote at a time.");
            return;
        }
        let pollEventId = await clientSendMessage(roomId, VOTE_PROMPT);
        currentVote = new Vote(NUM_PARTICIPANTS, roomId, pollEventId, () => {
            // Find index of thing to remove
            let entry = body.substring(BLOCKLIST_REMOVE.length).trim();
            let pos = contentBlocklist.indexOf(entry);
            if (pos < 0) {
                clientSendMessage("Error: that element is not in the block-list");
                return;
            }
            contentBlocklist.splice(contentBlocklist.indexOf(entry), 1);
            writeBlocklist();
        });
        return;
    }

    // Perform check with content block-list
    if (contentBlocklist.some(element => body.includes(element))) {
        clientSendMessage(roomId, CONTENT_WARNING);
    }
}

/**
 * Updates vote state using reaction data as appropriate.
 * @param {string} roomId String identifier associated with current room.
 * @param {object} event JSON object associated with reaction event
 * @returns Nothing
 */
function handleReaction(roomId, event) {
    // Nothing to do if there's no vote in progress
    if (currentVote === null) {
        return;
    }
    console.log("vote in progress!");
    let relatesTo = event["content"]["m.relates_to"];
    // Only process reaction data that is relevant to the event involving
    // the vote.
    if (relatesTo["event_id"] === currentVote.voteEventId) {
        if (relatesTo["key"] === "👍️") {
            currentVote.voteInFavor();
        } else if (relatesTo["key"] === "👎️") {
            currentVote.voteAgainst();
        }
    }

    let voteResult = currentVote.checkResult();
    // Check the state of the vote
    if (voteResult === VoteState.PASSED || voteResult === VoteState.NOT_PASSED) {
        currentVote = null;
    }
}

/**
 * General event handler. Delegates to reaction handler. Messages are handled
 * by `handleMessage`
 * @param {string} roomId String identifier of the room.
 * @param {object} event JSON object associated with the current event
 * @returns Nothing
 */
function handleEvent(roomId, event) {
    // console.log("here is the event: " + JSON.stringify(event))
    const eventType = event["type"];
    if (eventType === "m.reaction") {
        handleReaction(roomId, event);
    }
}

client.on("room.message", handleMessage);
client.on("room.event", handleEvent);
