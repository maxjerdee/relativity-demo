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
      IO.socket.on('startDebug', IO.startDebugResponse);
      IO.socket.on('newLandingQuestionResponse', IO.newLandingQuestionResponse);
      IO.socket.on('newDebugQuestionResponse', IO.newDebugQuestionResponse);
    },
    /**
     * Function called when server confirms connection
     */
    onConnected : function() {
      const mode_cookie = Cookies.getCookie('mode')
      if(mode_cookie==""){
        mode_cookie = "landing"
        Cookies.setCookie('mode','landing',1/(24*12))
      }
      console.log(mode_cookie)
      IO.socket.emit('handleLanding',{'mode':mode_cookie})
    }, /**
     * 
     * @param data templateLoaded, topic, question
     */
    startDebugResponse : function(data) {
      Cookies.setCookie('mode','debug',1/(24*12))
      if(!data.templateLoaded){
        App.$gameArea.html(App.$templateDebug)
      }
      App.Debug.displayQuestion(data.question)
    },
    newDebugQuestionResponse : function(data) {
      App.Debug.displayQuestion(data.question)
    },
    newLandingQuestionResponse : function(data) {
      App.Landing.displayQuestion(data.question)
    }
  }
  var App = {
    gameCode: '', // App.gameCode type variables
    question_id: -1,
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
    showInitScreen: function(){
      App.$gameArea.html(App.$templateLanding);
    },
    goLanding: function(){
      Cookies.setCookie('mode','landing');
      App.Landing.newLandingQuestion();
      App.$gameArea.html(App.$templateLanding);
    },
    bindEvents: function () {
      // General 
      App.$doc.on('click', '#title-container', App.goLanding);
      // Landing Page
      App.$doc.on('click', '#show-rules-button', App.Landing.showRules);
      App.$doc.on('click', '#public-game-button', App.Landing.goPublic);
      App.$doc.on('click', '#host-game-button', App.Landing.hostGameMenu);
      App.$doc.on('click', '#join-game-button', App.Landing.joinGameMenu);
      App.$doc.on('click', '#debug-mode-button', App.Landing.goDebug);
      App.$doc.on('click', '#fade-background', App.Landing.removeFade);
      App.$doc.on('click', '#new-question', App.Landing.newLandingQuestion);
      // Debug Page
      App.$doc.on('click', '#like-button', App.Debug.like);
      App.$doc.on('click', '#dislike-button', App.Debug.dislike);
      App.$doc.on('click', '#report-button', App.Debug.report);
      App.$doc.on('click', '#next-button', App.Debug.next);
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
        IO.socket.emit('goDebug')
      },
      removeFade : function(e){
        if (e.target == this){
          App.$gameCover.html('');
        }
      },
      /**
       * Ask server for new landing question, will respond with 'newLandingQuestionResponse'
       */
      newLandingQuestion : function(){
        IO.socket.emit('newLandingQuestion')
      },
      like : function(){
        
      },
      dislike : function(){
        
      },
      report : function(){

      },
      displayQuestion : function(question){
        App.question_id = question._id
        $('#question-text').html(question.question + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
      },
      feedbackAndQuestion(question_id, user, guess, feedback){
        IO.socket.emit('giveFeedback',{ 'question_id':question_id,
                                        'user':user,
                                        'mode':'landing',
                                        'guess':guess,
                                        'feedback':feedback
                                      })
        IO.socket.emit('newLandingQuestion')
      },
      showAnswer : function(question){
        $('#question-text').html(question.question.replace('[???]', question.plain_answer) + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
      }
    },
    // Debug Mode Functions
    Debug : {
      /**
       * display a Question on the debug screen, particularly substitute in the plain_answer
       * @param {*} question json question from database
       */
      displayQuestion : function(question){
        App.question_id = question._id
        $('#question-text').html(question.question.replace('???', question.plain_answer) + ' (<a href=\"https://en.wikipedia.org/?curid='+question.article_uuid+'\" target=\"_blank\">' + question.title + '</a>)')
      },
      like : function(question){
        App.Debug.feedbackAndQuestion('like')
      },
      dislike : function(question){
        App.Debug.feedbackAndQuestion('dislike')
      },
      report : function(question){
        App.Debug.feedbackAndQuestion('report')
      },
      next : function(question){
        App.Debug.feedbackAndQuestion('next')
      },
      /**
       * Function ultimately called by buttons to give feedback and get new question
       * @param {string} feedback (Ex: like/dislike)
       */
      feedbackAndQuestion(feedback){
        IO.socket.emit('giveFeedback',{ 'question_id':App.question_id,
                                        'user':'MAX',
                                        'mode':'debug',
                                        'guess':-1,
                                        'feedback':feedback
                                      })
        IO.socket.emit('newDebugQuestion')
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
    }
  }
  IO.init();
  App.init();
});

