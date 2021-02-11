/**
 * Server-side logic
 */
var io; // Reference to the Socket.io library
var gameSocket; // Reference to the Socket.io object for the connected client
var gameData = {};
var sessions = {}; // Keep track of all socket sessions, as well as the room they are in
// Each session has the "key" of the socket which first creates the session, which is called the "session_id".
// The corresponding value then contains client information like the {'mode':'landing','room':'RESD','sockets':[Socket1,Socket2]}
// Each session is meant to represent a single browser instance (which shares cookies), and update all tabs in that browser simulataneously

/* CONSTANTS */
const MAX_PLAYERS = 10;
/*
gameData is a json that contains the status of all ongoing games (Time Trials, Public, and Private)
Hopefully, it will be periodically backed up to a database, but for quick access it is also stored locally
It is first indexed by the room-id. In the case of a Public or Private game, this would be a 4-digit CODE.

*/

// DATABASE SESSION
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
    console.log('MongoDB Connected!')
  } finally {
    // Close the session to the MongoDB cluster (maybe eventually?)
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
// Extension of socket.on('session')
exports.initGame = function(sio, socket, address){
  // Saves the Socket.IO arguments to the global variables
  io = sio; 
  gameSocket = socket; 
  sessions[socket.id] = {'code':'none','sockets':[socket]} // Add this socket to conenctions, which stores all active sessions along with their associated room in order to manage dissessions
  gameSocket.emit('connected', {'address': address}); // Tell client server is live, and pass the address which contains the IP
  socket.on('disconnect', disconnect);
  // General Events (API)
  gameSocket.on('submitFeedback', submitFeedback); // Store some feedback in the database
  gameSocket.on('newQuestion', newQuestion); // Generate and return a new question
  gameSocket.on('submitAnswer', submitAnswer); // Submit an answer for judgement
  // Landing Events
  gameSocket.on('hostGame', hostGame); // Start a game, return with gameState
  gameSocket.on('joinGame', joinGame); // Join an existing game, return with exit status, and gameState if successful
  // Debug Events
  // Game Events
  gameSocket.on('startGame',startGame); // Start the game with given room code
  gameSocket.on('chooseOption',chooseOption); // Choose an option
  // Routing
  gameSocket.on('joinSession',joinSession); // Client asks to join an existing session (browser)
  gameSocket.on('goLandingSession',goLandingSession); // Tell everyone in session to go to landing page
}
/**
 * Called on fresh sessions to join them with existing sessions specified by the session_id.
 * @param {*} data session_id, socket_id
 */
function joinSession(data){
  console.log('joinSession')
  console.log(data)
  if(Object.keys(sessions).includes(data.socket_id)){ // Check that there is a session for us to pull the socket Object
    if(sessions[data.socket_id].sockets.length == 1 && sessions[data.socket_id].sockets[0].id == data.socket_id){ // Check that this session only has the lone socket
      var joiningSocket = sessions[data.socket_id].sockets[0] // Socket Object of the joining session, pulled from sessions. 
      if(Object.keys(sessions).includes(data.session_id)){ // Check if there is an existing session with the given session_id
        if(!sessions[data.session_id].sockets.includes(joiningSocket)){ // Make sure that the joining socket is not already present
          sessions[data.session_id].sockets.push(joiningSocket) // Add the socket object to the session
        }else{
          console.log(`Socket ${data.socket_id} is already part of session ${data.session_id}`)
        } 
      }else{ // If there is no session with the session_id, do not join
        console.log('No socket with given session_id')
        sessions[data.session_id] = {'code':'none','sockets':[joiningSocket]} // Create new session with the given session_id (this should only happen on server restarts)
      }
      delete sessions[data.socket_id] // Remove the lone session
    }else{
      console.log('joining socket is a host')
    }
  }else{
    console.log('No session with given socket_id found, unable to connect')
  }
  if(data.mode == 'game'){ // Attempt to rejoin an exiting game. 
    var playerId = playerPresent(data.code,data.session_id)
    if(playerId > -1){
      emitToSession(data.session_id,'joinGameResponse',{'response':'rejoin','playerId':playerId,'code':data.code,'gameState':gameData[data.code]})

    }else{ // If not in the game, tell to go to the landing page. 
      emitToSession(data.session_id,'goLanding')
    }
  }
  printSessions()
}
// Session things
function printSessions(){
  console.log('Sessions:')
  for (let [session_id, info] of Object.entries(sessions)) {
    var socket_ids = ""
    for (let socket of info.sockets){
      socket_ids += " " + socket.id.substring(0,4)
    }
    console.log(`session_id: ${session_id.substring(0,4)}, room: ${info.code}, socket_ids: ${socket_ids}`)
  }
}
function printRooms(){
  console.log('Rooms:')
  for (let [code, state] of Object.entries(gameData)){
    var session_ids = ""
    for (let player of state.players){
      session_ids += " " + player.id + ": " + player.session_id.substring(0,4)
      if(player.present){
        session_ids += " (P)"
      }else{
        session_ids += " (A)"
      }
    }
    console.log(`Room: ${code}, Sessions:${session_ids}`)
  }
}
/**
 * Emit to each socket in the session the given message and data
 * @param {*} session 
 * @param {*} message 
 * @param {*} data 
 */
function emitToSession(session_id,message,data={}){
  if(Object.keys(sessions).includes(session_id)){
    for(let socket of sessions[session_id].sockets){
      io.to(socket.id).emit(message,data)
    }
  }else{
    console.log(`No session with id ${session_id.substring(0,4)}`)
  }
}
function emitToRoom(code,message,data={}){
  io.to(code).emit(message,data)
}
function sessionJoinRoom(session_id,code){
  if(Object.keys(sessions).includes(session_id)){
    sessions[session_id].code = code
    for(var i = 0; i < sessions[session_id].sockets.length; i++){
      sessions[session_id].sockets[i].join(code)
    }
  }else{
    console.log(`No session with id ${session_id.substring(0,4)}`)
  }
  printSessions() 
}
function sessionLeaveRoom(session_id){
  if(Object.keys(sessions).includes(session_id)){
    playerAbsent(sessions[session_id].code, session_id)
    for(var i = 0; i < sessions[session_id].sockets.length; i++){
      sessions[session_id].sockets[i].leave(sessions[session_id].code)
    }
    sessions[session_id].code = 'none'
  }else{
    console.log(`No session with id ${session_id.substring(0,4)}`)
  }
  printSessions() 
}
function goLandingSession(data){
  console.log('goLandingSession')
  sessionLeaveRoom(data.session_id)
  emitToSession(data.session_id,'goLanding')
}
/**
 * Triggers by a socket disconnect. Searches the list of sessions for one that is no longer connected, and registers that player is now absent
 */
async function disconnect(){ // This isn't a great way to do this, but having trouble identifying where the disconnect event came from.
  for (let [session_id, info] of Object.entries(sessions)) { 
    //console.log(info)
    for(var i = 0; i < sessions[session_id].sockets.length; i++){
      if(!info.sockets[i].connected){
        console.log(`Removed the socket ${info.sockets[i].id.substring(0,4)} from session ${session_id.substring(0,4)}`)
        sessions[session_id].sockets.splice(i,1)
        if(sessions[session_id].sockets.length <= 0){
          sessionLeaveRoom(session_id)
          delete sessions[session_id] 
          console.log(`Removed the session ${session_id.substring(0,4)}`)
          break
        }
      }
    }  
  }
  printSessions()
}
/**
 * Get a question from the database by its _id 
 */
async function getQuestionById(question_id){
  var result = {}
  try {
    result = await client.db("wiki-guess").collection("questions").findOne({ _id: question_id });
  } catch (error) {
    console.error(error);
  } 
  return result
}
/**
 * Return a random question from the database
 */
async function randomQuestion(){
  const NUM_QUESTIONS = 100000
  var question_id = Math.floor(Math.random()*NUM_QUESTIONS);
  return await getQuestionById(question_id)
}
/* GENERAL FUNCTIONS */
/**
 * Get a new random question and return it to a socket
 * @param {*} data Contains session_id
 */
async function newQuestion(data){
  const question = await randomQuestion();
  emitToSession(data.session_id,'newQuestionResponse',{'question':question})
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
  switch(data.mode){
    case 'landing':
      const question = await getQuestionById(data.question_id);
      var guess = data.guess;
      var ratio = guess/question.num_answer;
      if(ratio <= 0){ 
        ratio = 10**3;
      }
      const questionScore = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0));
      emitToSession(data.session_id,'showAnswer',{'question':question,'questionScore':questionScore})
      break
    case 'game':
      if(Object.keys(gameData).includes(data.code)){
        var player =  gameData[data.code].players[data.playerId]
        player.guess = data.guess
        gameData[data.code].players[data.playerId].status = 'Guessed' // Full for the assignment
        var res = await checkFinishedGuessing(data.code)
        console.log(res)
        if(!res){
          io.to(data.code).emit('updatePlayerState',{'gameState':gameData[data.code]}) // Only need to update the player list
        } 
      }else{ 
        console.log('Bad game submission')
        emitToSession(data.session_id,'goLanding')
      }
      break
  }
} 
async function checkFinishedGuessing(code){
  var finishedGuessing = true
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){ // Check if all present players have guessed
      if(gameData[code].players[i].present && gameData[code].players[i].status != 'Guessed'){
        console.log(`${gameData[code].players[i].name}, ${gameData[code].players[i].present}, ${gameData[code].players[i].status}`)
        finishedGuessing = false
      }
    }
    if(finishedGuessing){
      await advanceGamePhase(code)
      emitToRoom(code,'updateGameState',{'gameState':gameData[code]})
    }
  }
  console.log(`Checked room ${code}, ${finishedGuessing}`)
  return finishedGuessing
}
// LANDING EVENTS  
function hostGame(data){
  const code = generateCode()
  if(code != ""){
    var name = data.name
    if(name == ""){
      name = 'Player 1'
    }
    const MAX_QUESTIONS = 1000
    const MAX_TIME = 300
    const DEFAULT_QUESTIONS = 15
    const DEFAULT_TIME = 30
    var question_number = data.question_number
    var question_time = data.question_time
    if(question_number == ''){
      question_number = DEFAULT_QUESTIONS
    }
    if(parseInt(question_number) > MAX_QUESTIONS){
      question_number = MAX_QUESTIONS
    }
    if(question_time == ''){
      question_time = DEFAULT_TIME
    }
    if(parseInt(question_time) > MAX_TIME){
      question_time = MAX_TIME
    }
    gameData[code] = {'code':code, // Room code
                      'scoreMode':data.score_mode,
                      'questionNumber':1, // Which question the lobby is on
                      'maxQuestions': question_number, // Total number of questions
                      'maxTime': question_time, // Maximum alloted time for each question (s)
                      'questionTimer':data.question_time, // Time remaining for current question (s)
                      'chooseTimer':8, // Time remaining to choose title (s)
                      'question':'', 
                      'gamePhase':'waiting', 
                      'chooser':0,
                      'choices':[{'title':'Question 1','id':1}, {'title':'Question 2','id':2}, {'title':'Question 3','id':3}],
                      'players':[{'id':0, // Information displayed on the player panel
                                  'present':true,
                                  'session_id':data.session_id,
                                  'name':name,
                                  'score':0,
                                  'status':'Host',
                                  'guess':-1,
                                  'questionScore':-1,
                                  'role':'host'}
                                ]
                      };
    addToGame(data.session_id,code,gameData[code],0)
  }else{
    console.log('Lobbies Full')
    emitToSession(data.session_id,'joinGameResponse',{'response':'lobbies_full'})
  }
}
/**
 * Called the first time a player is added to a game, writes to the gameState
 * @param {*} session_id 
 * @param {*} code 
 * @param {*} gameState 
 * @param {*} playerId 
 */
function addToGame(session_id,code,gameState,playerId){
  if(Object.keys(sessions).includes(session_id)){
    sessionJoinRoom(session_id,code)
  }else{
    console.log('missing '+session_id) 
    console.log(Object.keys(sessions)) 
  }
  emitToSession(session_id,'joinGameResponse',{'response':'success','code':code,'gameState':gameState,'playerId':playerId})
  emitToRoom(code,'updateGameState',{'gameState':gameState})
  if(Object.keys(gameData).includes(session_id)){
    sessions[session_id].code = code 
  }
  printRooms()
} 
function generateCode(){ 
  alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  // console.log(data)
  // Generate random code
  var code = "";
  const MAX_TRIES = 10;
  for(var t = 0; t < MAX_TRIES; t++){
    var tempCode = "";
    for(var l = 0; l < 4; l++){
      tempCode += alphabet[Math.floor(Math.random()*26)];
    }
    if(!Object.keys(gameData).includes(tempCode)){
      code = tempCode;
      break;
    }
  }
  return code
}
/**
 * 
 * @param {*} data 
 */
function joinGame(data){
  console.log(Object.keys(gameData))
  if(Object.keys(gameData).includes(data.code)){
    if(playerPresent(data.code,data.session_id) == -1){ // Add player to room if was already present
      var playerId = -1; // If not already present, try to make room
      var playerIds = [];
      for(var i = 0; i < gameData[data.code].players.length; i++){
        playerIds.push(gameData[data.code].players[i].id)
      }
      for(var id = 0; id < MAX_PLAYERS; id++){ // Check for an available id
        if(!playerIds.includes(id)){
          playerId = id 
          break
        }
      } 
      if(playerId >= 0){ 
        var name = data.name
        if(name == ''){ // Give Player a name with id
          name = 'Player ' + (playerId+1)
        }
        gameData[data.code].players.push({
                                            'id':playerId, // Information displayed on the player panel
                                            'present':true,
                                            'session_id':data.session_id,
                                            'name':name,
                                            'score':0,
                                            'status':'...',
                                            'guess':-1,
                                            'questionScore':-1,
                                            'role':'player'
                                          })
        addToGame(data.session_id,data.code,gameData[data.code],playerId)
      }else{ 
        emitToSession(data.session_id,'joinGameResponse',{'response':'lobby_full'})
      }
    }else{
      emitToSession(data.session_id,'joinGameResponse',{'response':'rejoin','playerId':playerId,'code':data.code,'gameState':gameData[data.code]})
      emitToRoom(data.code,{'updateGameState':gameData[data.code]})
    }
  }else{
    emitToSession(data.session_id,'joinGameResponse',{'response':'invalid_code'})
  }
} 
// DEBUG MODE
  
// GAME EVENTS
async function startGame(data){
  await advanceGamePhase(data.code)
  io.to(data.code).emit('updateGameState',{'gameState':gameData[data.code]})
}
async function chooseOption(data){
  if(gameData[data.code].gamePhase == 'choosing'){ // Check that this is being called from the right phase of the game
    await advanceGamePhase(data.code,data.option)
    io.to(data.code).emit('updateGameState',{'gameState':gameData[data.code]})
  }else{
    console.log('Bad chooseOption')
    console.log(gameData[data.code])
  }
}
async function advanceGamePhase(code,option=1){
  console.log(`code ${code}, phase ${gameData[code].gamePhase}`)
  if(Object.keys(gameData).includes(code)){
    switch(gameData[code].gamePhase){
      case 'waiting': // Also called to reset round
        for(var i = 0; i < gameData[code].players.length; i++){ // Find available chooser
          if(gameData[code].players[i].present){
            gameData[code].chooser = i
            break
          }
        }
        await populateChoices(code)
        gameData[code].gamePhase = 'choosing'
        startChooseTimer(code)
        break
      case 'choosing':
        if(gameData[code].questionNumber != 1){ // If it isn't the first question, tell the clients to submit their feedback at this point
          emitToRoom(code,'submitFeedback')
        }
        gameData[code].question = await getQuestionById(gameData[code].choices[option-1].id) // Get Question
        
        // Reset guesses, questionScore, status 
        for(var i = 0; i < gameData[code].players.length; i++){
          if(gameData[code].players[i].present){
            gameData[code].players[i].status = '...'
            gameData[code].players[i].questionScore = -1
            gameData[code].players[i].guess = -1
          } 
        }
        gameData[code].gamePhase = 'guessing' 
        startQuestionTimer(code)
        break
      case 'guessing':
        calculateScore(code)
        emitToRoom(code,'showAnswer',{'gameState':gameData[code]})
        gameData[code].questionNumber++
        if(gameData[code].questionNumber > gameData[code].maxQuestions){
          endGame(code)
          gameData[code].gamePhase = 'over'
        }else{
          gameData[code].gamePhase = 'waiting' // Go back to waiting
          await populateChoices(code)
          for(var i = 1; i <= gameData[code].players.length; i++){ // Find new chooser
            var looped_i = (gameData[code].chooser + i) % gameData[code].players.length
            if(gameData[code].players[looped_i].present){
              gameData[code].chooser = looped_i
              break
            }
          }
          gameData[code].gamePhase = 'choosing'
          startChooseTimer(code)
        }
        break
    }
  }else{
    console.log(`Advance game phase, game data lacks code ${code}`)
    printRooms()
  }
}
function calculateScore(code){
  const POINT_DISTRIBUTION = [1,2,4,6,9,12,16,20,25,30]
  const answer = gameData[code].question.num_answer
  var diffs = new Array(gameData[code].players.length);
  var scores = new Array(gameData[code].players.length);
  var numPresent = 0
  for(var i = 0; i < gameData[code].players.length; i++){
    scores[i] = 0
    if(gameData[code].players[i].present){
      numPresent++
      var guess = gameData[code].players[i].guess;
      if(guess != -1){
        console.log(`Player ${i}, guess ${guess}, answer ${answer}`)
        switch(gameData[code].scoreMode){ // Score differently based on the selected scoring mode
          case 'normal':
            ratio = guess/answer
            if(ratio <= 0){ // Watch out for strange inputs
              ratio = 100
            }
            scores[i] = Math.round(Math.max(100 - 100*Math.abs(Math.log10(ratio)),0)) // Log formula
            break
          case 'closest':
            diffs[i] = [Math.abs(answer - guess),i]
            break
          case 'under':
            if(guess > answer){
              diffs[i] = [-1,i]
            }else{
              diffs[i] = [answer - guess,i]
            }
            break
        }
      }
    }
  }
  if(gameData[code].scoreMode != "normal" && sorted_diffs.length > 0){
    var sorted_diffs = diffs.sort(function(first, second) { // Sort decreasing, but put the -1's in front
      if(first[0] == -1){
        if(second[0] == -1){
          return 0
        }
        return -1
      }
      if(second[0] == -1){
        return 1
      }
      return second[0] - first[0];
    });
    var last_diff = sorted_diffs[0][0]
    var num_tie = 0
    for(var i = 0; i < sorted_diffs.length; i++){
      if(sorted_diffs[i][0] != -1){
        console.log(sorted_diffs[i][0])
        if(last_diff != sorted_diffs[i][0]){
          console.log(`${last_diff} - ${i} - ${num_tie}`) 
          if(last_diff != -1){
            for(var back_i = 1; back_i <= num_tie; back_i++){ // Backtrack and assign the averaged score to the ties
              scores[sorted_diffs[i - back_i][1]] = Math.ceil(POINT_DISTRIBUTION.slice(i-num_tie,i).reduce((pv, cv) => pv + cv, 0)/num_tie);
            }
          }
          num_tie = 1
          last_diff = sorted_diffs[i][0]
          console.log(`Last Diff ${last_diff}`)
        }else{
          num_tie++
        }
      }
    }
    for(var back_i = 1; back_i <= num_tie; back_i++){ // Backtrack and assign the averaged score to the ties
      scores[sorted_diffs[sorted_diffs.length - back_i][1]] = Math.ceil(POINT_DISTRIBUTION.slice(sorted_diffs.length-num_tie,sorted_diffs.length).reduce((pv, cv) => pv + cv, 0)/num_tie);
    }
  }
  // Write scores to gameData
  for(var i = 0; i < gameData[code].players.length; i++){
    if(gameData[code].players[i].present){
      if(gameData[code].players[i].guess != -1){
        gameData[code].players[i].status = formatNumber(gameData[code].players[i].guess)
        gameData[code].players[i].questionScore = scores[i]
        gameData[code].players[i].score += scores[i]
      }else{
        gameData[code].players[i].status = '---'
        gameData[code].players[i].questionScore = 0
        gameData[code].players[i].score += 0
      }
    }
  }
}
/**
 * function to format a number into the string displayed as status
 * @param {*} number 
 */
function formatNumber(number){
  var adj_number = number
  var unit = ""
  if(number > 10**6){
    adj_number = number/10**6
    unit = "million"
    if(number > 10**9){
      adj_number = number/10**9
      unit = "billion"
      if(number > 10**12){
        adj_number = number/10**12
        unit = "trillion"
      }
    }
  }
  if(adj_number == Math.floor(adj_number)){
    return adj_number + " " + unit
  }
  if(adj_number*10 == Math.floor(adj_number*10)){
    return adj_number.toFixed(1) + " " + unit
  }
  return adj_number.toFixed(2) + " " + unit
}
function endGame(code){
  emitToRoom(code,'gameOver',{'gameState':gameData[code]})
}
async function populateChoices(code){
  for(var i = 0; i < 3; i++){
    var question = await randomQuestion()
    gameData[code].choices[i] = {'title':question.title,'id':question._id}
  }
}
async function startQuestionTimer(code){ 
  emitToRoom(code,'startQuestionTimer',{'maxTime':gameData[code].maxTime})
  var timer = setInterval(countItDown,1000);
  var timeLeft = gameData[code].maxTime
  // Decrement the displayed timer value on each 'tick'
  async function countItDown(){
    timeLeft -= 1
    if(Object.keys(gameData).includes(code)){
      gameData[code].questionTimer = timeLeft
      if(gameData[code].gamePhase == 'guessing'){
        /* In case we run into timer drift problems 
        if(timeLeft == 10){
          emitToRoom(code,'resyncQuestionTimer')
        }  
        */ 
        if(timeLeft == 0){ // Force Guess
          emitToRoom(code,'forceGuess')
        }
        if(timeLeft < 0){
          clearInterval(timer); 
          await advanceGamePhase(code);
          emitToRoom(code,'updateGameState',{'gameState':gameData[code]})
          return;
        } 
      }else{
        clearInterval(timer);
        return;
      }
    }else{
      clearInterval(timer);
      return;
    }
  }
}
async function startChooseTimer(code){
  const CHOOSE_TIME = 15
  emitToSession(gameData[code].players[gameData[code].chooser].session_id,'startChooseTimer',{'chooseTime': CHOOSE_TIME}) // Emit to the choosing session
  var timer = setInterval(countItDown,1000);
  var timeLeft = CHOOSE_TIME
  // Decrement the displayed timer value on each 'tick'
  async function countItDown(){
    timeLeft -= 1
    if(Object.keys(gameData).includes(code)){
      if(gameData[code].gamePhase == 'choosing'){
        if(timeLeft <= 0){ // Force Choose
          await chooseOption({'code':code,'option':Math.ceil(Math.random()*3)})
          emitToRoom(code,'updateGameState',{'gameState':gameData[code]})
        }
      }else{
        clearInterval(timer);
        return;
      }
    }else{
      clearInterval(timer);
      return;
    }
  }
}
// ROUTING
/**
 * Add the session to a given room, return if successfully added.
 * @param {*} code 
 * @param {*} session_id 
 */
function playerPresent(code, session_id){
  console.log(`playerPresent(${code},${session_id})`)
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){
      if(gameData[code].players[i].session_id == session_id){
        gameData[code].players[i].present = true // Player is now present
        if(Object.keys(sessions).includes(session_id)){
          sessionJoinRoom(session_id,code)
          gameData[code].players[i].session_id = session_id // Update stored socket id to the new socket id
          printRooms()
          return i
        }else{
          console.log('missing '+session_id) 
          console.log(Object.keys(sessions)) 
        }
      }
    }
  }else{
    console.log(`No room ${code}`)
  }
  printRooms()
  return -1
}
/**
 * Set a session in the gameState to not present, reassign hosting and make sure the game isn't held up
 * also close game if empty
 * @param {*} code 
 * @param {*} session_id 
 */
async function playerAbsent(code, session_id){
  console.log(`playerAbsent(${code},${session_id})`)
  var closeGame = false
  if(Object.keys(gameData).includes(code)){
    for(var i = 0; i < gameData[code].players.length; i++){
      if(gameData[code].players[i].session_id == session_id && gameData[code].players[i].present){
        gameData[code].players[i].present = false
        if(gameData[code].players[i].role == 'host'){
          closeGame = true
          for(var j = 0; j < gameData[code].players.length; j++){
            if(i != j && gameData[code].players[j].present){
              gameData[code].players[j].role = 'host' // New Host
              gameData[code].players[j].status = 'Host'
              gameData[code].players[i].role = 'player'
              gameData[code].players[i].status = '...'
              closeGame = false
              break
            }
          }
        }
        await tieLooseEnds(code, session_id) // Force Choose, Check if all answered
      }
    }
    if(!closeGame){
      emitToRoom(code,'updatePlayerState',{'gameState':gameData[code]})
      console.log(`Notified the room ${code}`)
    }else{
      delete gameData[code]
      console.log(`Closed room ${code}`)
    }
  }else{
    console.log(`No room ${code} to notify`)
  }
  printRooms()
  return closeGame
}
/**
 * After a player leaves a game for some reason, make sure they aren't holding up the game. Choose automatically and check for guessing to be over
 * @param {*} code Room code
 * @param {*} session_id session_id of the player leaving
 */
async function tieLooseEnds(code,session_id){
  if(Object.keys(gameData).includes(code)){
    console.log(gameData[code].players)
    console.log(gameData[code].chooser)
    if(gameData[code].chooser == -1 || gameData[code].players[gameData[code].chooser].session_id == session_id){ // If this session_id belongs to the current chooser..
      chooseOption({'code':code,'option':1}) // Just choose option 1
    }
  }  
  await checkFinishedGuessing(code) 
}