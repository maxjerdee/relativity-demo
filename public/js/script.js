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
$(document).ready(function(){
    console.log('startup');
    new_question();
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