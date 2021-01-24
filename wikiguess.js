/**
 * Server-side logic
 */
var io; // Reference to the Socket.io library
var gameSocket; // Reference to the Socket.io object for the connected client
var gameData = {};

// DATABASE CONNECTION
const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://mjerdee:doorknob2468!@cluster0.zmzmc.mongodb.net/Cluster0?retryWrites=true&w=majority"
const client = new MongoClient(uri, options={useUnifiedTopology: true});

/**
 * Called the first time wikiguess.js is used (only once)
 * in order to initially connect to the MongoDB cluster
 */
async function main(){
  try {
    // Connect to the MongoDB cluster
    await client.connect();
    console.log('MongoDB Connected')
  } finally {
    // Close the connection to the MongoDB cluster (maybe eventually?)
  }
}
main().catch(console.error) // Unsure what this is about tbh

/**
 * This function is called by index.js to initialize a new game instance.
 * Binds various Socket.IO messages sent by the client (app.js)
 * to server-side functions in this file.
 *
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client.
 */
exports.initGame = function(sio, socket, address){
  // Saves the Socket.IO arguments to the global variables
  io = sio; 
  gameSocket = socket;
  gameSocket.emit('connected', {'address': address}); // Tell client server is live
  // General Events (API)
  gameSocket.on('submitFeedback', submitFeedback);
  gameSocket.on('newQuestion', newQuestion); // Emitted by the client-side App.newQuestion()
  gameSocket.on('submitAnswer', submitAnswer); // Emitted by the client-side App.newQuestion()
  // Debug Events
  // Routing
  gameSocket.on('handleLanding',handleLanding)
}
/**API
 * Functions called by all sorts of screens 
 */
/**
 * @returns Random question drawn from database
 */
async function getQuestionById(question_id){
  var result = {}
  try {
    result = await client.db("wiki-guess").collection("questions").findOne({ _id: question_id });
  }catch (error) {
    console.error(error);
  }
  return result
}
async function randomQuestion(){
  /** Sample Question:
   * _id:45
question_uuid:"5858d9d2-5179-4ad3-993c-8c0f09cd8bc1"
article_uuid:713
title:"Android (robot)"
sent_index:71
question:"An android is a robot or other artificial being designed to resemble a..."
num_answer:400
plain_answer:400
question_topics:"{47: 0.23409678, 34: 0.17905709, 4: 0.173421}"
article_topics:"{10: 0.23318933}"
interactions:"[]" 
   */
  const NUM_QUESTIONS = 100000
  var question_id = Math.floor(Math.random()*NUM_QUESTIONS);
  return await getQuestionById(question_id)
}
/* GENERAL FUNCTIONS */
async function newQuestion(){
  const question = await randomQuestion();
  await gameSocket.emit('newQuestionResponse',{'question': question})
}
/**
 * Function to call when writing feedback to the database
 * @param data contains question_id,user,mode,guess,feedback 
 */
async function submitFeedback(data){
  try {
    var msec = Date.now();
    var date = new Date(msec);
    await client.db("wiki-guess").collection("questions").updateOne(
      { _id: data.question_id },
      {
        $push: {
          interactions: { 'user':data.user,
                          'date': date,
                          'mode':data.mode,
                          'guess':data.guess,
                          'feedback':data.feedback
                        } 
        }
      },
      {upsert : true}
    );
  }catch(e){
    console.log(e);
  }
}
async function submitAnswer(data){
  const question = await getQuestionById(data.question_id);
  var guess = data.guess;
  if(question.num_answer >= 10**6){ // given unit was millions
    guess = guess * 10**6;
  }
  var ratio = data.guess/question.num_answer;
  if(ratio <= 0){
    ratio = 10**3;
  }
  const score = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0));
  gameSocket.emit('submitAnswerResponse',{'question': question, 'score': score})
}
// DEBUG MODE

// ROUTING
/**
 * Do server-side tasks that must be done when a new user joins (including other modes in case of refresh)
 * @param data Socket.IO json with mode, user_id 
 */
async function handleLanding(data){
  switch(data.mode){
    case 'landing':
    case 'debug':
      break;
  }
}
