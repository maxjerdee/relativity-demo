$("#new-question").ready(function(){
    $("#new-question").click(function(){
        new_question();
    });
});
$("#show-answer").ready(function(){
    $("#show-answer").click(function(){
       show_answer();
    });
});

var players = [{'name':'Max','score':2370,'status':'Guessing','fastest':true,'bonus':'+94'},{'name':'Sam','score':230,'status':'Choosing','fastest':false,'bonus':''}]
$(document).ready(function(){
    console.log('startup');
    update_player_display(players);
});
var question_id = 0;
var socket = io();
var new_question = function(){
    socket.emit('new_question',{
        reason:'its my birthday'
    });
    $("#answer").text("");
    $("#show-answer").show();
    $("#guess-input").val("");
}
socket.on('new_question_response',function(data){
    $("#homepage-question").text("\"" + data.question + "\" (" + data.title + ")");
    question_id = data.id;
});
var show_answer = function(){
    socket.emit('show_answer',{
        "id":question_id
    });
    $("#show-answer").hide();
}
socket.on('show_answer_response',function(data){
    console.log($("#guess-input").val())
    if($("#guess-input").val()==""){
        $("#answer").text("Answer: " + data.answer);
    }else{
        given_answer = parseFloat($("#guess-input").val());
        right_answer = parseFloat(data.answer);
        //score formula
        score = Math.round(Math.max(100 - 100*Math.abs(Math.log10(given_answer/right_answer)),0));
        $("#answer").text("Answer: " + data.answer + ", Score: " + score);
    }
});
function update_player_display(players) {
    for(i = 0; i < players.length; i++){
        if(players[i]['fastest']){
            $("#player-list").append("<div class='player-wrapper col-6'><div class='player'><div class='player-top row m-0'><div class='col-8 p-0'><p class='player-name'>" + players[i]['name'] + "</p></div><div class='text-right col-4 p-0'><p class='player-score'>" + players[i]['score'] + "</p></div></div><div class='row player-bottom m-0'><div class='col-7 p-0'><div class='player-status text-center'>" + players[i]['status'] + "</div></div><div class='col-2 p-0'><img class='img-fluid' src='images/clock.png'></div><div class='col-3 p-0 text-right'><p>" + players[i]['bonus'] + "</p></div></div></div></div>");
        }else{
            $("#player-list").append("<div class='player-wrapper col-6'><div class='player'><div class='player-top row m-0'><div class='col-8 p-0'><p class='player-name'>" + players[i]['name'] + "</p></div><div class='text-right col-4 p-0'><p class='player-score'>" + players[i]['score'] + "</p></div></div><div class='row player-bottom m-0'><div class='col-7 p-0'><div class='player-status text-center'>" + players[i]['status'] + "</div></div><div class='col-2 p-0'></div><div class='col-3 p-0 text-right'><p>" + players[i]['bonus'] + "</p></div></div></div></div>");
        }
    }
}