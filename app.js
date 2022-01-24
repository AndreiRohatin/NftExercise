const express       = require('express')
const http          = require('http')
const WebSocket     = require('ws')
const Moralis       = require('moralis/node.js')
const WAValidator   = require('./wav');

//const app = express()
const port      = 8000
const server    = http.createServer(express);
const ws        = new WebSocket.Server({ server })
//save all clients in a dictionary for ease of access
const clients   = {}

//Generated Unique IDentifier
const GUID = () => {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4() + s4() + '-' + s4();
};

Moralis.start({
    serverUrl: 'https://b1uhcddra2ji.usemoralis.com:2053/server',
    appId: '01BP5axswZxnRnx7cToKtPvw7RbViRF1BbQMDsDz',
}).catch((error)=>{console.log(error)});


ws.on('connection', (connection) => {
    const ID = GUID();
    //save the connection for further usage
    clients[ID] = connection;

    //user is closing the session, so we might aswell remove him
    connection.on('close', () => {delete clients[ID];});

    //process the request from the client
    connection.on('message',async (message) => {
        const [data,isSuccessful]   = tryParseJSON(message);
        let rspv                    =  {};
        let rspvSuccess             = null;
        if(isSuccessful){
            if(data["query"] == "nfts"){
                if(data["chain"] && data["user"]){
                    try{
                        if(validateAddress(data["user"],data["chain"])){
                            const NFTs = await Moralis.Web3API.account.getNFTs({chain:data["chain"],address:data["user"]}).catch((error)=>{rspv=error;rspvSuccess=false;});
                            if(NFTs && NFTs["result"]) {rspv=NFTs["result"];rspvSuccess=true;}
                            else if(rspvSuccess == null){ 
                                //verify if we didn't get a error from moralis API
                                rspv = {message:"Error while retrieving data from Moralis API"};
                                rspvSuccess=false;
                            }
                        }else{
                            rspv = {message:"Invalid pair of network/address"};
                            rspvSuccess = false;
                        }
                    }catch(error){
                        //possible errors from wallet validator API
                        rspv = error;
                        rspvSuccess = false;
                    }
                }else{
                    rspv = {message:"No chain/address sent"};
                    rspvSuccess = false;
                }
            }else{
                rspv = {message:"Invalid query"};
                rspvSuccess = false;
            }
        }else{
            //deserialization failed so we must notify the user 
            rspv = {message:"Error while parsing JSON"};
            rspvSuccess = false;
        }
        clients[ID].send(JSON.stringify(TransactionResult(rspv,rspvSuccess)));
    });
});

//Create custom object for response in order to have easier visualisation
const TransactionResult = (rawObj,isSuccessful) => {
    if(!isSuccessful) { return {data:null,rawData:null,isSuccessful:false,error:rawObj}; }


    //define custom sorting function for descending sort by block_number
    rawObj.sort(function(x, y) {
        return (
          safeGet(y, 'block_number', Infinity)) - safeGet(x, 'block_number', Infinity) ;
      });

    const data=[];
    //we got a response from Moralis API
    for(const NFTRaw of rawObj){
        //object made only to display data easier
        const NFT={};
        NFT["name"]         = NFTRaw["name"];
        NFT["blockNumber"]  = NFTRaw["block_number"];
        NFT["contractType"] = NFTRaw["contract_type"];
        NFT["symbol"]       = NFTRaw["symbol"];
        const [metadata,isSuccessful] = tryParseJSON(NFTRaw["metadata"]);
        if(isSuccessful){
            NFT["imageURL"]     = metadata["image"];
            NFT["description"]  = metadata["description"];
        }else continue; // i think it's ok just to skip the whole nft if we have some corrupted data
        data.push(NFT);
    }

    return {data:data,rawData:rawObj,isSuccessful:true,error:null};
}
const tryParseJSON = (json) => {
    try{
        const retObj = JSON.parse(json);
        //make sure we parsed an object, not a integer/bool
        if(retObj && typeof retObj == "object") return [retObj,true];
        
    }catch(e){ /*we tried to a parse an invalid json*/ }

    return [null,false];
}
const safeGet = (obj, prop, defaultValue) => {
    try {
        return obj[prop];
    } catch(e) {
        return defaultValue;
    }
}
const validateAddress = (address,chain)=>{
    //validate only eth/matic/sol. There is no support atm for bsc/egld
    if(chain!='' && chain!='egld' && chain!='bsc' && address!=null && !WAValidator.validate(address, chain)){
        //user selected a network and wrote an address but they are wrong, let's give a warning
        return false;
    }else{
        //since we can't validate no client side we'll guess for now that everything is ok
        return true;
    }
}
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
})