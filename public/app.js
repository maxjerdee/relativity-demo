$(function() { // Module Format
  'use strict';
  // Socket.IO 
  var IO = { // Contains bindings and functions triggered by the server
    connected: false,
    needLanding: true,
    init: function() { 
    IO.socket = io.connect(); // Socket Object
    IO.bindEvents();
    },
    /**
     * While connected, Socket.IO will listen to the following events emitted
     * by the Socket.IO server, then run the appropriate function.
     */
    bindEvents : function() {
      IO.socket.on('connected', IO.onConnected);
      IO.socket.on('newQuestionResponse', IO.newQuestionResponse);
      IO.socket.on('showAnswer', IO.showAnswer);
      IO.socket.on('joinGameResponse', IO.joinGameResponse);
      IO.socket.on('updateGameState', IO.updateGameStateWrapper);
      IO.socket.on('updatePlayerState', IO.updatePlayerStateWrapper);
      IO.socket.on('goLanding',App.goLanding);
      IO.socket.on('submitFeedback',App.submitFeedbackWrapper)
      IO.socket.on('gameOver',IO.gameOver)
      IO.socket.on('startQuestionTimer',IO.startQuestionTimer)
      IO.socket.on('forceGuess',App.submitAnswer)
    },
    /**
     * Function called when server confirms connection
     */
    onConnected : function(data) {
      var pieces = data.address.split(':')
      App.user = pieces[pieces.length - 1]
      if(IO.needLanding){
        App.newQuestion()
        IO.socket.emit('handleLanding',{'mode':Cookies.getMode(),'socket_id':IO.socket.id,'code': Cookies.getCookie('code'),'game_socket_id':Cookies.getCookie('game_socket_id')}) // Server-side startup
        IO.needLanding = false
      }
      IO.connected = true
    },
    newQuestionResponse : function(data) {
      App.displayQuestion(data.question)
    },
    showAnswer : function(data) {
      $('#feedback-row').show()
      $('#feedback-row').children().show()
      const question = data.gameState.question;
      switch(App.mode){
        case 'landing':
          break;
        case 'game':
          break;
      }
      $('#question-text').html(question.question.replace('[???]','<b>'+question.plain_answer+'</b>') + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
      console.log(data.gameState.players[App.playerId].questionScore)
      $('#score').html('Points: '+data.gameState.players[App.playerId].questionScore);
      $('#score').show();
    },
    joinGameResponse : function(data){
      switch(data.response){
        case 'success':
          App.mode = 'game'
          App.code = data.code
          Cookies.setCookie('mode',App.mode,60/(24*60)) // Store game information for 1 hour
          Cookies.setCookie('code',App.code,60/(24*60))
          Cookies.setCookie('game_socket_id',IO.socket.id,60/(24*60))
          App.$gameCover.html('')
          App.showInitScreen()
          App.playerId = data.playerId
          IO.updateGameState(data.gameState)
          break;
        case 'lobbies_full':
          $('#error-message').html('Lobbies are full')
          break;
        case 'invalid_code':
          $('#error-message').html('Invalid Code')
          break;
        case 'lobby_full':
          $('#error-message').html('Lobby Full')
          break;
      }
    },
    updateGameStateWrapper : function(data){
      IO.updateGameState(data.gameState)
    },
    /**
     * Update the UI to reflect the current gameState. Includes calling updatePlayerState()
     * @param {*} gameState 
     */
    updateGameState : function(gameState){
      IO.updatePlayerState(gameState)
      App.playerRole = gameState.players[App.playerId].role
      App.gamePhase = gameState.gamePhase;
      App.maxTime = gameState.maxTime;
      $('#room-text').html('Code: ' + gameState.code)
      switch(gameState.scoreMode){
        case 'normal':
          $('#mode-text').html('Mode: Normal')
          break
        case 'closest':
          $('#mode-text').html('Mode: Closest')
          break
        case 'under':
          $('#mode-text').html('Mode: Under')
          break
      }
      switch(gameState.gamePhase){
        case 'waiting':
          if(App.playerRole=='host'){
            $('#question-header').html(App.$templateWaitingHost);
          }else{
            $('#question-header').html(App.$templateWaitingPlayer);
          }
          break;
        case 'choosing':
          if(App.playerId == gameState.chooser){
            $('#question-header').html(App.$templateChoosing);
            $('#option1-text').html(gameState.choices[0].title);
            $('#option2-text').html(gameState.choices[1].title);
            $('#option3-text').html(gameState.choices[2].title);
          }else{
            $('#question-header').html(App.$templateChoosingWait);
            $('#waiting-message').html("Waiting for " + gameState.players[gameState.chooser].name + " to choose an article...")
          }
          break;
        case 'guessing':
            $('#question-header').html('');
            $('#question-wrapper').html(App.$templateGuessing);
            $('#question-number').html('Q: '+gameState.questionNumber+'/'+gameState.maxQuestions)
            $('#timer').html('Time: ' + gameState.maxTime)
            App.displayQuestion(gameState.question);
            if(gameState.players[App.playerId].status != '...'){
                $('#guess').hide()
            }
            break;
      }
    },
    updatePlayerStateWrapper : function(data){ 
      IO.updatePlayerState(data.gameState)
    },
    updatePlayerState : function(gameState){
      var sortedScores = new Array(gameState.players.length);
      for(var i = 0; i < gameState.players.length; i++){
        sortedScores[i] = gameState.players[i].score
      }
      sortedScores = sortedScores.sort();
      $('#player-list').html('');
      for(var i = 0; i < gameState.players.length; i++){
        var playerData = gameState.players[i];
        if(playerData.present){
          var questionScore = ''
          if(playerData.questionScore != '-1'){
            questionScore = '+' + playerData.questionScore 
          }
          $('#player-list').append('<div class="player-wrapper col-6"><div class="player green"><div class="player-top row"><div class="col-8 p-0"><p class="player-name">'+playerData.name+'</p></div><div class="text-right col-4 p-0"><p class="player-score">'+playerData.score+'</p></div></div><div class="row player-bottom"><div class="col-8 p-0 status-wrapper"><div class="player-hl"></div><div class="player-status">'+playerData.status+'</div></div><div class="col-4 p-0 text-right"><p>'+questionScore+'</p></div></div></div></div>');
        }
      }
      //Still want to remove the player's Guess Button
      if(gameState.players[App.playerId].status != '...'){
        $('#guess-button').hide()
      }
      //And update the Waiting counter
      if(gameState.players[App.playerId].status == 'Guessed'){
        var numPresent = 0
        var numGuessed = 0
        for(var i = 0; i < gameState.players.length; i++){
          if(gameState.players[i].present){
            numPresent++
            if(gameState.players[i].status == 'Guessed'){
              numGuessed++
            }
          }
        }
        $('#score').html('Waiting: ' + numGuessed + '/' + numPresent)
        $('#score').show()
      }
    },
    gameOver: function(data){
      console.log('Game Over')
      $('#question-header').html(App.$gameOver);
    },
    startQuestionTimer: function(data){
      var timer = setInterval(countItDown,1000);
      var timeLeft = data.maxTime
      // Decrement the displayed timer value on each 'tick'
      async function countItDown(){
        timeLeft -= 1
        if(App.gamePhase == 'guessing' && timeLeft >= 0){
          $('#timer').html('Time: ' + timeLeft)
        }else{
          clearInterval(timer);
          return;
        }
      }
    }
  }
  var App = {
    code: '', 
    question_id: -1,
    guess: -1,
    user: 'unknown',
    feedback: 'none',
    mode: 'landing',
    playerRole: 'player',
    gamePhase: 'waiting',
    maxTime: 30,
    playerId: -1,
    init: function () {
        App.cacheElements();
        App.showInitScreen();
        App.bindEvents();
    },
    /**
     * Cache templates (and the document object) for later use
     */
    cacheElements: function () {
      // Frequently referenced objects
      App.$doc = $(document); 
      App.$gameArea = $('#gameArea'); // Full body
      App.$gameCover = $('#gameCover'); // overlay (used to gray out #gameArea)
      // Cache templates
      App.$templateLanding = $('#template-landing').html();
      App.$templateRules = $('#template-rules').html();
      App.$templateHost = $('#template-host').html();
      App.$templateJoin = $('#template-join').html();
      App.$templateDebug = $('#template-debug').html();
      App.$templateGame = $('#template-game').html();
      App.$templateGuessing = $('#template-guessing').html();
      App.$templateWaitingHost = $('#template-waiting-host').html();
      App.$templateWaitingPlayer = $('#template-waiting-player').html();
      App.$templateChoosing = $('#template-choosing').html();
      App.$templateChoosingWait = $('#template-choosing-wait').html();
      App.$templateGuessing = $('#template-guessing').html();
      App.$gameOver = $('#game-over').html();
    },
    /**
     * Client-side startup
     */
    showInitScreen: function(){
      switch(Cookies.getMode()){
        case 'landing':
          App.$gameArea.html(App.$templateLanding);
          break;
        case 'debug':
          App.$gameArea.html(App.$templateDebug);
          break;
        case 'game':
          App.$gameArea.html(App.$templateGame)
          break;
      }
      if(IO.connected && IO.needLanding){ // Delay server-side handleLanding until a connection has been established. If it hasn't yet, delay to onConnected()
        App.newQuestion()
        IO.socket.emit('handleLanding',{'mode':Cookies.getMode(),'socket_id':IO.socket.id,'code': Cookies.getCookie('code'),'game_socket_id':Cookies.getCookie('game_socket_id')}) // Server-side startup
        IO.needLanding = false
      }
      
    },
    /**
     * Return to home screen. Usually called by clicking the banner
     */
    goLanding: function(){
      App.mode = 'landing'
      Cookies.setCookie('mode',App.mode);
      App.showInitScreen();
      IO.socket.emit('handleLanding',{'mode':'landing','socket_id':IO.socket.id,'code': Cookies.getCookie('code'),'game_socket_id':Cookies.getCookie('game_socket_id')}) // Server-side startup
      IO.socket.emit('newQuestion',{'socket_id':IO.socket.id})
    },
    /**
     * Bind events, such as clicking on objects, with js function calls
     */
    bindEvents: function () {
      // General 
      App.$doc.on('click', '#title-container', App.goLanding);
      App.$doc.on('click', '#new-question', App.newQuestionWrapper);
      App.$doc.on('click', '#like-button', App.like);
      App.$doc.on('click', '#dislike-button', App.dislike);
      App.$doc.on('click', '#report-button', App.report);
      App.$doc.on('click', '#guess-button', App.submitAnswer);
      // Landing Page 
      App.$doc.on('click', '#show-rules-button', App.Landing.showRules);
      App.$doc.on('click', '#public-game-button', App.Landing.goPublic);
      App.$doc.on('click', '#host-game-button', App.Landing.hostGameMenu);
      App.$doc.on('click', '#join-game-button', App.Landing.joinGameMenu);
      App.$doc.on('click', '#debug-mode-button', App.Landing.goDebug);
      App.$doc.on('click', '#fade-background', App.Landing.removeFade);
      App.$doc.on('click', '#host-game', App.Landing.hostGame)
      App.$doc.on('click', '#join-game', App.Landing.joinGame)
      // Game Page
      App.$doc.on('click', '#start-game', App.Game.startGame);
      App.$doc.on('click', '#option1', App.Game.option1);
      App.$doc.on('click', '#option2', App.Game.option2);
      App.$doc.on('click', '#option3', App.Game.option3);
      App.$doc.on('click', '#play-again', App.Landing.hostGameMenu);
      $("#guess-input").keyup(function(event){
        if (event.keyCode === 13) {
          console.log(`Key logged on guess-input ${event.keyCode}`)
          App.submitAnswer();
        }
      });
      // Debug Page
    },
    // General Functions called by multiple modes
    newQuestionWrapper : function(){
      App.newQuestion()
    },
    /**
     * Ask server for new question, will return with newQuestionResponse, will also give feedback if not the first question
     * @param {boolean} first true if this is the first question loaded on the page, and so will not submit feedback
     */
    newQuestion : function(first = false){
      if(!first){
        if(App.mode == 'debug' || App.guess != -1){ // Stop raw New Question from giving feedback
          App.submitFeedback()
        }
        Helper.clearFeedbackButtons()
      }
      $('#guess-button').show();
      $('#score').hide();
      switch(App.mode){
        case 'landing':
          $('#feedback-row').hide();
          $('#feedback-row').children().hide();
          break;
        case 'debug':
          break;
      }
      App.guess = -1;
      App.feedback = 'none';
      Cookies.setCookie('mode',Cookies.getMode(),10/(24*60)) // Refresh cookie
      IO.socket.emit('newQuestion',{'socket_id':IO.socket.id});
    },
    /**
     * Called by IO.newQuestionResponse()
     * @param {*} question 
     */
    displayQuestion : function(question){
      App.question_id = question._id
      $('#guess-input').val('');
      switch(App.mode){
        case 'landing':
        case 'game':
          $('#feedback-row').hide();
          $('#feedback-row').children().hide();
          $('#question-text').html(question.question + ' (<i>' + question.title + '</i>)')
          break;
        case 'debug':
          $('#question-text').html(question.question.replace('???', question.plain_answer) + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
          break;
      }
      if(question.num_answer >= 10**6){ // Display the unit millions if the answer is >=1000000
        $('#units-col').show()
        $('#units-col').children().show()
      }else{
        $('#units-col').hide()
        $('#units-col').children().hide()
      }
    },
    like : function(question){
      if(App.feedback != 'like'){
        App.feedback = 'like'
        Helper.changeButtonColor($('#like-button'),'green')
        Helper.changeButtonColor($('#dislike-button'),'blue')
        Helper.changeButtonColor($('#report-button'),'blue')
      }else{
        Helper.clearFeedbackButtons()
      }
      if(App.mode == 'debug'){
        App.newQuestion()
      }
    },
    dislike : function(question){
      if(App.feedback != 'dislike'){
        App.feedback = 'dislike'
        Helper.changeButtonColor($('#like-button'),'blue')
        Helper.changeButtonColor($('#dislike-button'),'red')
        Helper.changeButtonColor($('#report-button'),'blue')
      }else{
        Helper.clearFeedbackButtons()
      }
      if(App.mode == 'debug'){
        App.newQuestion()
      }
    },
    report : function(question){
      if(App.feedback != 'report'){
        App.feedback = 'report'
        Helper.changeButtonColor($('#like-button'),'blue')
        Helper.changeButtonColor($('#dislike-button'),'blue')
        Helper.changeButtonColor($('#report-button'),'grey')
      }else{
        Helper.clearFeedbackButtons()
      }
      if(App.mode == 'debug'){
        App.newQuestion()
      }
    },
    /**
     * Guess answer to the current question
     */
    submitAnswer(){
      $('#guess-button').hide();
      App.guess = $('#guess-input').val()
      IO.socket.emit('submitAnswer',{
                                      'socket_id':IO.socket.id,
                                      'question_id': App.question_id,
                                      'guess': App.guess,
                                      'playerId':App.playerId,
                                      'code': App.code,
                                      'mode': App.mode
                                    });
    },
    /**
     * Function called by buttons to submit feedback, pulled from App.feedback
     */
    submitFeedbackWrapper(data){
      App.submitFeedback()
    },
    submitFeedback(){
      const feedback = { 
                        'question_id':App.question_id,
                        'user':App.user,
                        'mode':App.mode,
                        'guess':App.guess,
                        'feedback':App.feedback,
                        'socket_id':IO.socket.id
                        };
      console.log('Feedback: '+feedback)
      IO.socket.emit('submitFeedback',feedback);
    },
    // Client-side functions called from landing (mostly bound to buttons)
    Landing : {
      showRules : function(){
        App.$gameCover.html(App.$templateRules)
      },
      goPublic : function(){
        IO.socket.emit('goPublic',{'socket_id':IO.socket.id})
      },
      hostGameMenu : function(){
        App.$gameCover.html(App.$templateHost)
      },
      joinGameMenu : function(){
        App.$gameCover.html(App.$templateJoin)
      },
      goDebug : function(){
        App.$gameArea.html(App.$templateDebug)
        App.mode = 'debug'
        Cookies.setCookie('mode',App.mode,10/(24*60))
        App.newQuestion(true)
      },
      removeFade : function(e){
        if (e.target == this){
          App.$gameCover.html('');
        }
      },
      hostGame : function(){
        IO.socket.emit('hostGame', {'socket_id':IO.socket.id,'name':$('#host-name').val(),'question_number':$('#question-number').val(),'question_time':$('#question-time').val(),'score_mode':$('#scoreMode').val()})
      },
      joinGame : function(){
        IO.socket.emit('joinGame', {'socket_id':IO.socket.id,'game_socket_id':Cookies.getCookie('game_socket_id'),'name':$('#join-name').val(),'code':$('#join-code').val().toUpperCase()})
      }
    },
    // Debug Mode Functions
    Debug : {
      
    },
    // Game Mode Function
    Game : {
      startGame : function(){
        IO.socket.emit('startGame',{'socket_id':IO.socket_id, 'code': App.code})
      },
      option1 : function(){
        IO.socket.emit('chooseOption',{'socket_id':IO.socket_id, 'code': App.code, 'option': 1})
      },
      option2 : function(){
        IO.socket.emit('chooseOption',{'socket_id':IO.socket_id, 'code': App.code, 'option': 2})
      },
      option3 : function(){
        IO.socket.emit('chooseOption',{'socket_id':IO.socket_id, 'code': App.code, 'option': 3})
      }
    }
  }
  var Cookies = {
    /**
     * 
     * @param {string} cname Name of cookie 
     * @param {*} cvalue Cookie value
     * @param {number=100} exdays Number of days cookie will last
     */
    setCookie : function(cname, cvalue, exdays=100) { // Should add "Secure" to the end of the cookie string for https
      var d = new Date();
      d.setTime(d.getTime() + (exdays*24*60*60*1000));
      var expires = "expires="+ d.toUTCString();
      document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
    },
    /**
     * 
     * @param {string} cname Name of cookie
     */
    getCookie : function(cname) {
      var name = cname + "=";
      var decodedCookie = decodeURIComponent(document.cookie);
      var ca = decodedCookie.split(';');
      for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
          c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
          return c.substring(name.length, c.length);
        }
      }
      return "";
    },
    /**
     * Get the current mode of the site, will be landing by default, and refresh the landing cookie (mode cookie lasts 5 minutes)
     */
    getMode : function() {
      var mode = Cookies.getCookie('mode')
      if(mode == ""){
        mode = "landing"
        Cookies.setCookie('mode','landing',1/(24*12))
      }
      return mode
    }
  }
  var Helper = {
    /**
     * Change color of a Button jQuery element by switching the class
     * @param {Object} element Button jQuery element
     * @param {string} color string with color name (blue, green, red, grey)
     */
    changeButtonColor : function(element, color){
      element.removeClass('blue-hoverable')
      element.removeClass('green-hoverable')
      element.removeClass('red-hoverable')
      element.removeClass('grey-hoverable')
      switch(color){
        case 'blue':
          element.addClass('blue-hoverable')
          break;
        case 'green':
          element.addClass('green-hoverable')
          break;
        case 'red':
          element.addClass('red-hoverable')
          break;
        case 'grey':
          element.addClass('grey-hoverable')
          break;
      }
    },
    clearFeedbackButtons : function(){
      App.feedback = 'none'
      Helper.changeButtonColor($('#like-button'),'blue')
      Helper.changeButtonColor($('#dislike-button'),'blue')
      Helper.changeButtonColor($('#report-button'),'blue')
    }
  }
  IO.init();
  App.init();
});

