const fs = require('fs');
const path = require('path');
require('dotenv').config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
const ytdl = require('ytdl-core');
const unirest = require('unirest');
const cheerio=require('cheerio');
var YoutubeMp3Downloader = require("youtube-mp3-downloader");
const ffmpegPath=require('ffmpeg-static');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');


console.log("server running...");
console.log('path to ffmpeg',ffmpegPath);

const store= new MongoStore({ mongoose: mongoose });

const client = new Client({
  authStrategy: new RemoteAuth({
    store: store,
    backupSyncIntervalMs: 300000
  }),
  
  puppeteer:{
    //'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--shm-size=3gb',
  ]
  }
});

mongoose.connect(process.env.MONGODB_URI).then(() => {
  client.initialize();
});

client.on('remote_session_saved', () => {
  console.log('session saved to remote db!')
})

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
                  console.log('Joke:',joke);
                  if(!joke){
                    throw new Error('Some error :(');
                  }
                  chat.sendMessage(joke);
                })
                .catch((err) => {
                  console.log('get joke catch:','Some error occured');
                  chat.sendMessage('Some error occured :(');
                });
              }else if(command==='/get quote'){
                getQuote().then((quote)=>{
                    console.log(quote);
                    if(!quote){
                      throw new Error('Some error :(');
                    }
                    chat.sendMessage(quote);
                })
                .catch((err) => {
                  console.log('get quote catch:','Some error occured');
                  chat.sendMessage('Some error occured :(');
                });
              }else if(command.startsWith("/yt download") && !command.includes("audio")){
                chat.sendMessage('Processing your url...');
               
                const url= command.substring(command.lastIndexOf(' ')+1);
                console.log('YT url',url);

                if(!isValidYTURL(url)){
                  chat.sendMessage("This url is not supported");
                  throw new Error("url not supported");
                }

                const downloadStream=ytdl(url, {format:'mp4',quality:18});
                const cpyFilePath=path.join(__dirname,'videos','temp.mp4');
                const outputStream=fs.createWriteStream(cpyFilePath);

                downloadStream.pipe(outputStream);

                outputStream.on('error',(err)=>{
                  console.log('There was an error downloading YT video..',err);
                  chat.sendMessage('There was some error downloading the video :(');
                });

                outputStream.on('finish', ()=>{
                  const media=MessageMedia.fromFilePath(cpyFilePath);
                    
                  chat.sendMessage(media)
                  .then(res=>console.log(res))
                  .catch(err=>{
                    console.log('get YT video catch:','Some error occured',err);
                    chat.sendMessage('Some error occured :(');
                  });
                });
              }else if(command.startsWith('/get google images')){
                chat.sendMessage('Processing your request...');

                const lastSpaceIndex=command.lastIndexOf(' ');
                const num=parseInt(command.substring(lastSpaceIndex+1));
                if(isNaN(num)){
                  chat.sendMessage('specified number is invalid!');
                  throw new Error('NaN number');
                }

                const query=command.substring(getNthSpaceIndex(command,3)+1,lastSpaceIndex)
                .trim()
                .replace(' ','+');

                if(!query || query===''){
                  chat.sendMessage('specify some keywords!');
                  throw new Error('invalid query');
                }

                console.log(query,num);
                const searchUrl=`https://www.google.com/search?q=${query}&tbm=isch`;
                const imagePath=path.join(__dirname,'images','temp.jpg');
                const urls=[];
                getGoogleImageUrls(searchUrl,num,urls).then((res)=>{
                  console.log('urls:',urls);

                  if(!res){
                    throw new Error('Some error occured :(');
                  }

                  try {
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
                  } catch (error) {
                    console.log('Error downloading images',error);
                    chat.sendMessage('Error occured while downloading images :(');
                  }
                }).catch(err=>{
                  console.log('get images catch:','Some error occured');
                  chat.sendMessage('Some error occured :(');
                });
              }else if(command.startsWith('/yt download audio')){
                console.log('downloading audio...')

                chat.sendMessage('Processing your url...');

                const url=command.substring(command.lastIndexOf(' ')+1).trim();

                if(!isValidYTURL(url)){
                  chat.sendMessage("This url is not supported");
                  throw new Error("url not supported");
                }

                const videoId=getYTVideoIdByUrl(url);

                if(!videoId){
                  chat.sendMessage('This video doesn\'t exist :(');
                  throw new Error('Video does not exist');
                }

                var YD = new YoutubeMp3Downloader({
                "ffmpegPath": ffmpegPath,        // FFmpeg binary location
                "outputPath": path.join(__dirname,'audio'),    // Output file location (default: the home directory)
                "youtubeVideoQuality": "highestaudio",  // Desired video quality (default: highestaudio)
                "queueParallelism": 2,                  // Download parallelism (default: 1)
                "progressTimeout": 2000,                // Interval in ms for the progress reports (default: 1000)
                "allowWebm": false                      // Enable download from WebM sources (default: false)
              });

              chat.sendMessage('Extracting audio...');

              YD.download(videoId,'temp.mp3');

              YD.on("finished", function(err, data) {
                console.log('finished...');
                console.log(JSON.stringify(data));

                const media=MessageMedia.fromFilePath(path.join(__dirname,'audio','temp.mp3'));

                chat.sendMessage(media)
                .then(res=>console.log(res))
                .catch(err=>{
                  console.log('get YT video audio catch:','Some error occured',err);
                  chat.sendMessage('Some error occured :(');
                });
              });

              YD.on("error", function(error) {
                console.log('Error downloading audio...',error);
                chat.sendMessage('Some error occured :(');
              });

              YD.on("progress", function(progress) {
                console.log(JSON.stringify(progress));
              });
              
              }else if(command.startsWith('/search dictionary')){
                const searchWords=command.substring(getNthSpaceIndex(command,2)+1).trim();
                console.log(searchWords.length);

                if(!searchWords || searchWords.length===0 || searchWords===-1){
                  chat.sendMessage('Specify the target word/s!');
                  throw new Error('Invalid search words');
                }

                getDictionaryDefinition(searchWords).then(res=>{
                  if(res){
                    chat.sendMessage(res);
                  }else{
                    throw new Error('Some error :(');
                  }
                })
                .catch(err=>{
                  console.log('get dict. meaning catch:','Some error occured');
                  chat.sendMessage('Some error occured :(');
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
    '/yt download <url> - downloads and sends video from the specified YT url\n'+
    '/yt download audio <url> - downloads and sends only audio from the specified YT url\n'+
    '/get google images <keywords> <number> - gets specified number of google images for the keywords\n'+
    '/search dictionary <keywords> - search the merriam webster collegiate dictionary';
}

function isValidYTURL(url) {
  var regex = /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:[^\s]*)?$/;
  return regex.test(url);
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

function getYTVideoIdByUrl(url) {
  const reg = /^(https?:)?(\/\/)?((www\.|m\.)?youtube(-nocookie)?\.com\/((watch)?\?(feature=\w*&)?vi?=|embed\/|vi?\/|e\/)|youtu.be\/)([\w\-]{10,20})/i
  const match = url.match(reg);
  if (match) {
      return match[9];
  } else {
      return null;
  }
}


async function getJoke() {
  try {
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
  } catch (error) {
    console.log('Error occured while fetching joke',error);
    return null;
  }
}

async function getQuote(){
  try {
    const res=await fetch("https://api.quotable.io/random");
    const resJson=await res.json();

    console.log(resJson);

    return `"${resJson.content}"\n ~${resJson.author}`; 
  } catch (error) {
    console.log('Error occured while fetching quote',error);
    return null;
  }
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
  

  try {
    const res=await unirest.get(searchUrl).headers(header);

    let $=cheerio.load(res.body);

    let ct=0;

    const allUrls=[];

    $('div.bRMDJf.islir img').each(function() {
      if($(this).attr('data-src')){
        ct++;
        allUrls.push($(this).attr('data-src'));
      }
      
      if(ct===num*10){
        return false;
      }
    });

    for(let i=0;i<num;i++){
      urls.push(allUrls[Math.floor(Math.random() * num*10)])
    }

    console.log(urls);

    return 1;
  } catch (error) {
    console.log('error downloading images',error);
    return null;
  }
}

async function downloadImage(url, path) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return buffer;
  } catch (error) {
    console.log('Error while downloading images',error);
    return null;
  }
}

async function getDictionaryDefinition(word) {
  try {
    const encodedWord = encodeURIComponent(word);
    const url = `https://dictionaryapi.com/api/v3/references/collegiate/json/${encodedWord}?key=${process.env.MERRIAM_WEBSTER_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    let definition=null;

    if (data.length > 0) {
      definition = data[0]["shortdef"][0];
      console.log(`Definition of ${word}: ${definition}`);
    } else {
      console.log(`The word ${word} was not found.`);
    }

    return definition;
  } catch (error) {
    console.log('Error occured while fetching dict. meaning',error);
    return null;
  }
}
