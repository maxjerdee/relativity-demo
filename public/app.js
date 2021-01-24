$(function() { // Module Format
  'use strict';
  // Socket.IO 
  var IO = { // Contains bindings and functions triggered by the server
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
    },
    /**
     * Function called when server confirms connection
     */
    onConnected : function(data) {
      App.user = data.address
    },
    newQuestionResponse : function(data) {
      App.displayQuestion(data.question)
    }
  }
  var App = {
    gameCode: '', // App.gameCode type variables
    question_id: -1,
    guess: -1,
    user: 'unknown',
    feedback: 'none',
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
    },
    /**
     * Client-side startup
     */
    showInitScreen: function(){
      const mode = Cookies.getMode();
      switch(mode){
        case 'landing':
          App.$gameArea.html(App.$templateLanding);
          break;
        case 'debug':
          App.$gameArea.html(App.$templateDebug);
          break;
      }
      IO.socket.emit('handleLanding',{'mode':mode})
    },
    /**
     * Return to home screen. Usually called by clicking the banner
     */
    goLanding: function(){
      if(Cookies.getMode() != 'landing'){
        Cookies.setCookie('mode','landing');
        App.showInitScreen();
      }
    },
    /**
     * Bind events, such as clicking on objects, with js function calls
     */
    bindEvents: function () {
      // General 
      App.$doc.on('click', '#title-container', App.goLanding);
      App.$doc.on('click', '#new-question', App.newQuestion);
      App.$doc.on('click', '#like-button', App.like);
      App.$doc.on('click', '#dislike-button', App.dislike);
      App.$doc.on('click', '#report-button', App.report);
      // Landing Page 
      App.$doc.on('click', '#show-rules-button', App.Landing.showRules);
      App.$doc.on('click', '#public-game-button', App.Landing.goPublic);
      App.$doc.on('click', '#host-game-button', App.Landing.hostGameMenu);
      App.$doc.on('click', '#join-game-button', App.Landing.joinGameMenu);
      App.$doc.on('click', '#debug-mode-button', App.Landing.goDebug);
      App.$doc.on('click', '#fade-background', App.Landing.removeFade);
      /*
      $("#guess-input").keyup(function(event){
        if (event.keyCode === 13) {
          $("#guess").click();
        }
      });
      */
      // Debug Page
    },
    // General Functions called by multiple modes
    /**
     * Ask server for new question, will return with newQuestionResponse, will also give feedback if not the first question
     * @param {boolean} first true if this is the first question loaded on the page, and so will not submit feedback
     */
    newQuestion : function(first=false){
      if(!first){
        Helper.clearFeedbackButtons()
        App.submitFeedback()
      }
      App.guess = -1;
      App.feedback = 'none';
      Cookies.setCookie('mode',Cookies.getMode(),10/(24*60)) // Refresh cookie
      IO.socket.emit('newQuestion');
    },
    /**
     * Called by IO.newQuestionResponse()
     * @param {*} question 
     */
    displayQuestion : function(question){
      App.question_id = question._id
      switch(Cookies.getMode()){
        case 'landing':
          $('#question-text').html(question.question + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
          break;
        case 'debug':
          $('#question-text').html(question.question.replace('???', question.plain_answer) + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
          break;
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
      if(Cookies.getMode() == 'debug'){
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
      if(Cookies.getMode() == 'debug'){
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
      if(Cookies.getMode() == 'debug'){
        App.newQuestion()
      }
    },
    /**
     * Function called by buttons to submit feedback, pulled from App.feedback
     */
    submitFeedback(){
      IO.socket.emit('submitFeedback',{ 'question_id':App.question_id,
                                      'user':App.user,
                                      'mode':Cookies.getMode(),
                                      'guess':App.guess,
                                      'feedback':App.feedback
                                    });
    },
    // Client-side functions called from landing (mostly bound to buttons)
    Landing : {
      showRules : function(){
        App.$gameCover.html(App.$templateRules)
      },
      goPublic : function(){
        IO.socket.emit('goPublic')
      },
      hostGameMenu : function(){
        App.$gameCover.html(App.$templateHost)
      },
      joinGameMenu : function(){
        App.$gameCover.html(App.$templateJoin)
      },
      goDebug : function(){
        App.$gameArea.html(App.$templateDebug)
        Cookies.setCookie('mode','debug',10/(24*60))
        App.newQuestion(first=true)
      },
      removeFade : function(e){
        if (e.target == this){
          App.$gameCover.html('');
        }
      },
      showAnswer : function(question){
        $('#question-text').html(question.question.replace('[???]', question.plain_answer) + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
      }
    },
    // Debug Mode Functions
    Debug : {
      
    }
  }
  var Cookies = {
    /**
     * 
     * @param {string} cname Name of cookie 
     * @param {*} cvalue Cookie value
     * @param {number=100} exdays Number of days cookie will last
     */
    setCookie : function(cname, cvalue, exdays=100) {
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

