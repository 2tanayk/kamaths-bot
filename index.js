const fs = require('fs');
const path = require('path');
require('dotenv').config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth,MessageMedia } = require("whatsapp-web.js");
const ytdl = require('ytdl-core');
const unirest = require('unirest');
const cheerio=require('cheerio');
const { url } = require('inspector');
var YoutubeMp3Downloader = require("youtube-mp3-downloader");


console.log("server running...");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer:{
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
}
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", (session) => {
  console.log("authenticated!");
});

client.on("ready", () => {
  console.log("Client is ready!");

  client.getChats()
  .then((chats) => {
      const myGroup = chats.find((chat) =>chat.name === "Kamaths" &&
      chat.id._serialized === process.env.KAMATHS_GROUP_ID);
      console.log(myGroup);
      const myGroupId = myGroup.id._serialized;

      client.on("message", (message) => {
        message.getChat()
        .then((chat) => {
            if (chat.name === "Kamaths" && chat.id._serialized === myGroupId) {
              console.log("Message from Kamaths:");
              let command = message.body.trim();
              console.log(command);

              if (command.charAt(0) !== "/") {
                throw new Error("Not a command");
              }
              
              if(command==='/help'){
                chat.sendMessage(botHelpMsg());
              }else if(command==='/test'){
                chat.sendMessage("Hi! I am a bot!");
              }else if(command==='/get joke'){
                getJoke().then((joke) => {
                    console.log(joke);
                    chat.sendMessage(joke);
                  })
                  .catch((err) => {
                    throw err;
                  });
              }else if(command==='/get quote'){
                getQuote().then((quote)=>{
                    console.log(quote);
                    chat.sendMessage(quote);
                })
                .catch((err) => {
                  throw err;
                });
              }else if(/^\/yt download (http(s)?:\/\/)(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9-_]+$/.test(command)){
                chat.sendMessage('Processing your url...');
                const url= command.substring(command.lastIndexOf(' ')+1);
                console.log('YT url',url);
                const downloadStream=ytdl(url, {format:'mp4',quality:18});
                const cpyFilePath=path.join(__dirname,'videos','temp.mp4');
                const outputStream=fs.createWriteStream(cpyFilePath);

                downloadStream.pipe(outputStream);

                outputStream.on('finish', ()=>{
                  const media=MessageMedia.fromFilePath(cpyFilePath);
                    
                  chat.sendMessage(media)
                  .then(res=>console.log(res))
                  .catch(err=>{
                    throw err;
                  });
                });
              }else if(command.startsWith('/get google images')){
                const lastSpaceIndex=command.lastIndexOf(' ');
                const num=parseInt(command.substring(lastSpaceIndex+1));
                const query=command.substring(getNthSpaceIndex(command,3)+1,lastSpaceIndex)
                .trim()
                .replace(' ','+');

                console.log(query,num);
                const searchUrl=`https://www.google.com/search?q=${query}&tbm=isch`;
                const imagePath=path.join(__dirname,'images','temp.jpg');
                const urls=[];
                getGoogleImageUrls(searchUrl,num,urls).then(()=>{
                  console.log('urls:',urls);

                  async function sendImages(){
                    for(const url of urls){
                      const buffer = await downloadImage(url,imagePath);
                      console.log('image downloaded!')
                      fs.writeFileSync(imagePath,buffer);
                      console.log('image copied to file','sending....');
                      const media=MessageMedia.fromFilePath(imagePath);
                      chat.sendMessage(media);
                    }
                  }

                  sendImages();
                }).catch(err=>{
                  throw err;
                });

              }else if(command.startsWith('/yt download audio')){
                console.log('downloading audio...')
                var YD = new YoutubeMp3Downloader({
                "ffmpegPath": "C:/Users/tanay/ffmpeg-5.1.2/bin/ffmpeg.exe",        // FFmpeg binary location
                "outputPath": path.join(__dirname,'audio'),    // Output file location (default: the home directory)
                "youtubeVideoQuality": "highestaudio",  // Desired video quality (default: highestaudio)
                "queueParallelism": 2,                  // Download parallelism (default: 1)
                "progressTimeout": 2000,                // Interval in ms for the progress reports (default: 1000)
                "allowWebm": false                      // Enable download from WebM sources (default: false)
              });

              //Download video and save as MP3 file
              YD.download("Xequthp5WjM",'temp.mp3');

              YD.on("finished", function(err, data) {
                console.log('finished...');
                console.log(JSON.stringify(data));

                const media=MessageMedia.fromFilePath(path.join(__dirname,'audio','temp.mp3'));
                chat.sendMessage(media);
              });

              YD.on("error", function(error) {
                console.log('Error...',error);
              });

              YD.on("progress", function(progress) {
                console.log(JSON.stringify(progress));
              });
              }else{
                chat.sendMessage("No such command exists :(\n\nUse /help command to view the possible commands");
              }
            }
          })
        .catch((err) => {
          console.log(err);
          if(err.message!=='Not a command'){
            client.sendMessage("919323138762-1452313159@g.us",'There was some error :(');
          }
        });
      });
    })
    .catch((err) => console.log(err));
});

function botHelpMsg(){
    return '/help - lists all supported commands\n'+
    '/get quote - gets a random quote\n'+
    '/get joke - gets a random joke\n'+
    '/yt download <url> - downloads and sends the YT video\n'+
    '/get google images <keywords> <number>';
}

function getNthSpaceIndex(str, n) {
  var count = 0;
  for (var i = 0; i < str.length; i++) {
    if (str[i] === ' ') {
      count++;
    }
    if (count === n) {
      return i;
    }
  }
  return -1;
}


async function getJoke() {
  const res = await fetch("https://icanhazdadjoke.com/", {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const resJson = await res.json();

  console.log(resJson);

  return resJson.joke;
}

async function getQuote(){
    const res=await fetch("https://api.quotable.io/random");
    const resJson=await res.json();

    console.log(resJson);

    return `"${resJson.content}"\n ~${resJson.author}`;
}

async function getGoogleImageUrls(searchUrl,num,urls){
  const selectRandom = () => {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
    ];
    var randomNumber = Math.floor(Math.random() * userAgents.length);
    return userAgents[randomNumber];
  };

  let user_agent = selectRandom();

  let header = {
    "User-Agent": `${user_agent}`,
  };

  const res=await unirest.get(searchUrl).headers(header);

  let $=cheerio.load(res.body);

  let ct=0;

  $('div.bRMDJf.islir img').each(function() {
    if($(this).attr('data-src')){
      ct++;
      urls.push($(this).attr('data-src'));
    }
    
    if(ct===num){
      return false;
    }
  });

  console.log(urls);
}

async function downloadImage(url, path) {
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return buffer;
}

client.initialize();
