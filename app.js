// Require express and create an instance of it
var express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const crypto = require('crypto');
var mongoose = require('mongoose');
var m = require('./scripts/database.js');
var app = express();
var cookies = require("cookie-parser");
const { moveMessagePortToContext } = require('worker_threads');

app.use(cookies());
m.init();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


function hashPassword(password, callback) {
    var salt = crypto.randomBytes(128).toString('base64');
    var iterations = 10000;
    crypto.pbkdf2(password, salt, iterations, 64, 'sha512', function (err, derivedKey) {
        callback({
            salt: salt,
            hash: derivedKey.toString('hex'),
            iterations: iterations
        });
    });

    
}

function isAuthenticated(req, method, permissionReq, callback) {
    if (req.headers.authorization || req.cookies.session) {
        
        var token = req.headers.authorization || req.cookies.session;
        jwt.verify(token, 'secret', async function (err, decoded) {
            if (err) {
                callback(false, undefined);
            } else {
                var randomReqNum = Math.random()*200;
                req.user = decoded;
                try{
                    if(permissionReq != undefined && permissionReq.length > 0){
                        var u = (await m.getDocs('Account', {_id: decoded.id}))[0];
                        var group = (await m.getDocs('Group', {uniqueId: u.group}))[0];
                        
                        var specificRolePerms = group.roles.filter(r => r.name == u.access.role)[0].permissions;
                        var access = false;
    
                        for(var pN = 0; pN < permissionReq.length; pN++){
                            var p = permissionReq[pN];
                            if(specificRolePerms.includes(p) || specificRolePerms.includes('*')){
                                
                                callback(true, decoded);
                                
                                access = true;
                                break;
                            }
                        }
                        
                        if(!access){
                            callback(false, decoded);
                        }
                    }else{
                        callback(true, decoded);
                    }
                }catch(e){
                    callback(false, decoded);
                }
                

                


                
            }
        });
    } else {
        callback(false, undefined);
    }
}

// focus on getting a specific part, and then redirecting
app.get("/part*", function(req, res){
    var path = req.originalUrl;
    var part = path.substring(req.originalUrl.indexOf("/part") + 5);
    res.redirect(part + "/?part=1");
});


app.get('/', function (req, res) {
    console.log("A");
    res.sendFile(__dirname + "/views/base.html");
    console.log("B");
    
    //res.end();
});


app.get('/home*', function (req, res) {
    
    isAuthenticated(req, "cookie",[], function(status, user){
        if(status){
            if(req.query.part != undefined){
                res.setHeader("group", user.group);
                res.sendFile(__dirname + "/views/a_home.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }else{
            if(req.originalUrl.split("/").length > 2 && !req.originalUrl.split("/")[2].startsWith("?")){
                var group = req.originalUrl.split("/")[2];
                // CHECK IF GROUP PUBLIC HERE
                 
                if(req.query.part != undefined){
                    //res.setHeader("group", group);
                    res.sendFile(__dirname + "/views/a_home.html");
                }else{
                    res.sendFile(__dirname + "/views/base.html");
                }
            }else{
                if(req.query.part != undefined){
                    res.sendFile(__dirname + "/views/home.html");
                }else{
                    
                    res.sendFile(__dirname + "/views/base.html");
                }
            }
        }
        
    })
    
    
    //res.end();
});

app.get('/about', function (req, res) {
    if(req.query.part != undefined){
        res.sendFile(__dirname + "/views/about.html");
    }else{
        res.sendFile(__dirname + "/views/base.html");
    }
    //res.end();
});

app.get('/present', function (req, res) {
    if(req.query.part != undefined){
        res.sendFile(__dirname + "/views/present.html");
    }else{
        res.sendFile(__dirname + "/views/base.html");
    }
    //res.end();
});
app.get('/createpresent', function (req, res) {
    if(req.query.part != undefined){
        res.sendFile(__dirname + "/views/createpresent.html");
    }else{
        res.sendFile(__dirname + "/views/base.html");
    }
    //res.end();
});


app.get('/create', function (req, res) {
    if(req.query.part != undefined){
        res.sendFile(__dirname + "/views/create.html");
    }else{
        res.sendFile(__dirname + "/views/base.html");
    }
    //res.end();
});

app.post('/acc/login', function (req, res){
    m.getDocs('Account', {username: req.body.username, group: req.body.group}).then(async function(docs){
        if(docs.length == 0){
            res.send(JSON.stringify({successful: false}));
        }else{
            crypto.pbkdf2(req.body.password, docs[0].pwsalt, docs[0].pwiterations, 64, 'sha512', async function(err, derivedKey){
                if(docs[0].pwhash == derivedKey.toString('hex')){
                    var token = jwt.sign({
                        username: req.body.username,
                        group: req.body.group,
                        id: docs[0]._id
                    }, 'secret', {
                        expiresIn: '24h'
                    });
                    res.send(JSON.stringify({successful: true, user: await createSafeUser(docs[0], 3), token: token}));
                }else{
                    res.send(JSON.stringify({successful: false}));
                }
            })
            
        }
    });
    
});

async function createSafeUser(u, access){
    var group = (await m.getDocs('Group', {uniqueId: u.group}))[0];
    var role = group.roles.find(r => r.name == u.access.role);
    var safeUser = {
        username: u.username,
        group: u.group,
        id: u._id,
        attendance: u.attendance,
        access: u.access,
        fullname: u.fullname,
        protonLog: u.protonLog,
        notes: u.notes,
        email: (access > 1 ? u.email : undefined),
        permissions: role == undefined ? [] : role.permissions,
        notes: (access > 1 ? u.notes : undefined)


    }
    return safeUser;
}


app.get('/acc/verify', function(req, res){
    
    try{
        var token = req.cookies.session;
        var decoded = jwt.verify(token, 'secret');
        m.getDocs('Account', {_id: decoded.id}).then(async function(docs){
            if(docs.length == 0){
                res.send(JSON.stringify({successful: false}));
            }else{

                res.send(JSON.stringify({successful: true, user: await createSafeUser(docs[0], 1)}));
            }
        });
    }catch(e){
        res.send(JSON.stringify({successful: false}));
    }
});

app.post('/check/groupExists', function(req, res){
    m.getDocs('Group', {uniqueId: req.body.group}).then(function(docs){
        if(docs.length == 0){
            res.send(JSON.stringify({valid: false}));
        }else{
            res.send(JSON.stringify({valid: true}));
        }
    });
})

app.post('/acc/create', function (req, res){


    m.getDocs('Group', {uniqueId: req.body.group}).then(function(docs){
        if(docs.length == 0){
            res.send(JSON.stringify({successful: false, error: "group"}));
            return;
        }
        m.getDocs('Account', {username: req.body.username, group: req.body.group}).then(function(docs){
            if(docs.length == 0){
                hashPassword(req.body.password, function(pwres){
                    m.createDoc('Account', {
                        username: req.body.username,
                        email: req.body.email,
                        pwhash: pwres.hash,
                        pwsalt: pwres.salt,
                        pwiterations: pwres.iterations,
                        group: req.body.group,
                        access: {
                            role: "guest",
                            restricted: false,
                            elevated: false
                        },
                        connections: []
    
                    }).then(async function(d){
                        var token = jwt.sign({
                            username: req.body.username,
                            group: req.body.group,
                            id: d._id
                            // NOTICE: CHANGE TO .ENV FILE
                        }, 'secret', {
                            expiresIn: '2h'
                        });
                        d.token = token;
                        res.send(JSON.stringify({successful: true, user: await createSafeUser(d, 3), token: token}));
                    });

                    

                    
                });
                
            }else{
                res.send(JSON.stringify({successful: false, error: "username"}));
            }
        });
    });
    
    

    
});

app.get("/group/links", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            var links = await m.getDocs("QuickLink", {group: user.group});
            res.send(JSON.stringify({successful: true, items: links}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/presentation", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            var pres = await m.getDocs("Presentation", {group: user.group});
            console.log(pres);
            res.send(JSON.stringify({successful: true, presentation: pres[0]}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/users", async function(req, res){
    isAuthenticated(req, "cookie",["*"], async function(status, user){
        if(status){
            var users = await m.getDocs("Account", {group: user.group});
            var group = await m.getDocs("Group", {uniqueId: user.group});
            var safeUsers = [];
            console.log(users);
            console.log(user.group);
            for(var i = 0; i < users.length; i++){
                safeUsers.push(await createSafeUser(users[i], 2));
            }
            res.send(JSON.stringify({successful: true, items: safeUsers, roles: group[0].roles}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/roles", async function(req, res){
    isAuthenticated(req, "cookie",["*"], async function(status, user){
        if(status){
            var group = await m.getDocs("Group", {uniqueId: user.group});
            
            res.send(JSON.stringify({successful: true, items: group[0].roles}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/protons", async function(req, res){
    isAuthenticated(req, "cookie",["*", "COLLECT_PROTONS"], async function(status, user){
        if(status){
            var u = undefined;
            if(req.query.id != undefined){
                u = (await m.getDocs("Account", {_id: req.query.id}))[0];
                
            }else{
                u = (await m.getDocs("Account", {_id: user.id}))[0];
            }

            var total = 0;
            for(var i = 0; i < u.protonLog.length; i++){
                total += u.protonLog[i].protons;
            }
            
            res.send(JSON.stringify({successful: true, total: total, log: u.protonLog}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.post('/group/protons', async function(req, res){
    isAuthenticated(req, "cookie",["*", "AWARD_PROTONS", "AWARD_PROTONS_INFINITE"], async function(status, user){
        if(status){
            // the user awarding the protons NEEDS to have enough protons to award the user
            var requestingUser = await m.getDocs("Account", {_id: user.id})[0];
            var permissions = await m.getDocs("Group", {uniqueId: user.group}).roles.find(r => r.name == requestingUser.access.role).permissions;
            if(permissions.includes("AWARD_PROTONS_INFINITE")){
                // allow for any operation
            }
            else{
                // check for quota

                var protonRequests = await m.getDocs("Group", {uniqueId: user.group}).protonAssignments;
                var total = 0;
                protonRequests.forEach(p => {
                    if(p["assigner"] == user.id){
                        total += p.protons;
                    }

                })

                if(total + req.body.protons < 50){
                    // set protons of resulting user
                }else{
                    res.status(401).send(JSON.stringify({successful: false, message: "OUT OF PROTONS"}));
                }

            }
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.post("/group/role", async function(req, res){
    isAuthenticated(req, "cookie",["*"], async function(status, user){
        if(status){
            var id = req.body._id;
            var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
            if(req.body.action == "edit"){
                var item = group.roles.find(r => r.name == req.body.oldName);
                var index = group.roles.indexOf(item);
                item.name = req.body.name;
                item.color = req.body.color;
                item.permissions = req.body.permissions;
                var oldName = req.body.oldName;
                group.roles[index] = item;

                // need to update all users with old role name
                var users = await m.getDocs("Account", {group: user.group});
                users.forEach(async function(u){
                    if(u.access.role == oldName){
                        u.access.role = req.body.name;
                        await m.updateDoc("Account", {_id: u._id}, {access: u.access});
                    }
                })
                await m.updateDoc("Group", {_id: group._id}, {roles: group.roles});


                
            }else if(req.body.action == "create"){

                var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
                group.roles.push({
                    name: req.body.name,
                    color: req.body.color,
                    permissions: req.body.permissions
                });
                await m.updateDoc("Group", {_id: group._id}, {roles: group.roles});
            }else if(req.body.action == "delete"){
                var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
                var item = group.roles.find(r => r.name == req.body.name);
                console.log(group.roles);
                group.roles.splice(group.roles.indexOf(item), 1);
                console.log(group.roles);

                await m.updateDoc("Group", {_id: group._id}, {roles: group.roles});
            }
            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/this", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            var group = await m.getDocs("Group", {uniqueId: user.group});
            
            res.send(JSON.stringify({successful: true, group: group[0]}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/subgroups", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            var group = await m.getDocs("Group", {uniqueId: user.group});
            
            res.send(JSON.stringify({successful: true, items: group[0].subgroups}));

        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});


app.post("/group/subgroup", async function(req, res){
    isAuthenticated(req, "cookie",["*"], async function(status, user){
        if(status){
            var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
            if(req.body.action == "edit"){
                var item = group.subgroups.find(r => r.name == req.body.oldName);
                var index = group.subgroups.indexOf(item);
                item.name = req.body.name;
                item.tag = req.body.tag;
                item.features = req.body.features;
                item.joinable = req.body.joinable;
                item.managers = req.body.managers;
                var oldName = req.body.oldName;
                group.subgroups[index] = item;

                // need to update all users with old role name
                var users = await m.getDocs("Account", {group: user.group});
                users.forEach(async function(u){
                    u.access.groups.forEach(async function(g) {
                        if(g == oldName){
                            u.access.groups[u.access.groups.indexOf(g)] = req.body.name;
                        }
                    })
                    await m.updateDoc("Account", {_id: u._id}, {access: u.access});
                })
                await m.updateDoc("Group", {_id: group._id}, {subgroups: group.subgroups});


                
            }else if(req.body.action == "create"){

                var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
                group.subgroups.push({
                    name: req.body.name,
                    tag: req.body.tag,
                    features: req.body.features,
                    joinable: req.body.joinable
                });
                await m.updateDoc("Group", {_id: group._id}, {subgroups: group.subgroups});
            }else if(req.body.action == "delete"){
                var group = (await m.getDocs("Group", {uniqueId: user.group}))[0];
                var item = group.subgroups.find(r => r.name == req.body.name);
                group.subgroups.splice(group.subgroups.indexOf(item), 1);

                await m.updateDoc("Group", {_id: group._id}, {subgroups: group.subgroups});
            }
            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});


app.post("/group/link", async function(req, res){
    isAuthenticated(req, "cookie", ["ADMIN_QUICKLINKS", "ADMIN_QUICKLINKS_CREATE"] ,async function(status, user){
        if(status){
            var id = req.body._id;
            if(req.body.action == "edit"){
                await m.updateDoc("QuickLink", {_id: id}, {
                    name: req.body.name,
                    from: req.body.from,
                    to: req.body.to,
                    restricted: req.body.restricted
                });
            }else if(req.body.action == "create"){
                await m.createDoc("QuickLink", {
                    name: req.body.name,
                    to: req.body.to,
                    restricted: req.body.restricted,
                    group: user.group
                });
            }else if(req.body.action == "delete"){
                await m.deleteDoc("QuickLink", {_id: id});
            }
            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});
app.get("/group/items", function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        var group = "";
        if(status){
            group = user.group;
        }
        if((req.headers["group"] != undefined && req.headers["group"] != "")){
            group = req.headers["group"];
            
            
        }
        var groupItem = (await m.getDocs("Group", {uniqueId: group.length == undefined ? group["uniqueId"] : group}))[0];
        
        
        if(group != ""){
            m.getDocs('ModuleItem', {group: group}).then(function(docs){
                res.send(JSON.stringify({successful:true, items: docs, group: groupItem}));
            });
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.post("/group/meeting", async function(req, res){
    isAuthenticated(req, "cookie",["*", "ADMIN_SCHEDULE"], async function(status,user){
        // must have edit main page access
        if(status){
            var id = req.body._id;
            if(req.body.action == "edit"){
                await m.updateDoc('AttendanceItem', {_id: id}, {
                    title: req.body.title,
                    datetime: req.body.datetime,
                    length: req.body.length,
                    description: req.body.description,
                    subgroups: req.body.subgroups,
                    code: req.body.code
                });
            }else if(req.body.action == "create"){
                console.log(req.body.subgroups);
                await m.createDoc('AttendanceItem', {
                    title: req.body.title,
                    datetime: req.body.datetime,
                    length: req.body.length,
                    description: req.body.description,
                    code: req.body.code,
                    group: user.group,
                    subgroups: req.body.subgroups
                })
            }else if(req.body.action == "delete"){
                await m.deleteDoc('AttendanceItem', {_id: id});
            }
            

            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
        


    })
});

app.post("/group/present", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status,user){
        // must have edit main page access
        if(status){
            var id = req.body._id;
            if(req.body.action == "edit"){
                await m.updateDoc('Presentation', {_id: id}, {
                    title: req.body.title,
                    public: req.body.public,
                    slides: JSON.parse(req.body.slides)
                });
            }else if(req.body.action == "create"){
                await m.createDoc('Presentation', {
                    group: user.group,
                    by: user.id,
                    title: req.body.title,
                    public: true,
                    slides : JSON.parse(req.body.slides)
                })
            }else if(req.body.action == "delete"){
                await m.deleteDoc('Presentation', {_id: id});
            }
            

            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
        


    })
});

app.post("/group/item", async function(req, res){
    isAuthenticated(req, "cookie",["ADMIN_LANDING", "ADMIN_LANDING_CREATE"], async function(status,user){
        // must have edit main page access
        if(status){
            var id = req.body._id;
            if(req.body.action == "edit"){
                await m.updateDoc('ModuleItem', {_id: id}, {
                    title: req.body.title,
                    contents: req.body.contents,
                    icon: req.body.icon,
                    result: req.body.result,
                    show: req.body.show
                });
            }else if(req.body.action == "create"){
                await m.createDoc('ModuleItem', {
                    title: req.body.title,
                    contents: req.body.contents,
                    icon: req.body.icon,
                    result: req.body.result,
                    show: req.body.show,
                    group: user.group
                })
            }else if(req.body.action == "delete"){
                console.log("deleting");
                await m.deleteDoc('ModuleItem', {_id: id});
            }
            

            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
        


    })
});


function getTodaysEvent(docs){
    var today = new Date();
    var closestToNow = null;
    docs.forEach(d => {
        if(today.getDate() == d.datetime.getDate() && today.getMonth() == d.datetime.getMonth() && today.getFullYear() == d.datetime.getFullYear()){
            // this is TODAY
            if(closestToNow == null){
                closestToNow = d;
            }else{
                if(d.datetime.getTime() < closestToNow.datetime.getTime()){
                    closestToNow = d;
                }
            }
        }
    });
    return closestToNow;
}

app.get("/group/meetings", async function(req, res){
    isAuthenticated(req, "cookie",["VIEW_SCHEDULE"], async function(status, user){
        if(status){
            var group = user.group;
            var docs = await m.getDocs("AttendanceItem", {group: group});
            
            res.send(JSON.stringify({successful: true, items: docs}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/today", async function(req, res){
    isAuthenticated(req, "cookie",["VIEW_SCHEDULE", "VIEW_SCHEDULE_SIGNIN"], async function(status, user){
        if(status){
            user = await m.getDocs('Account', {_id: user.id});
            user = user[0];
        
            if(req.headers["group"] != user.group){
                var docs = await m.getDocs('AttendanceItem', {group: user.group});
                var closestToNow = getTodaysEvent(docs);

                
                
                res.send(JSON.stringify({successful:true, today: closestToNow == null ? undefined : {
                    id: closestToNow._id,
                    datetime: closestToNow.datetime,
                    title: closestToNow.title,
                    description: closestToNow.description,
                    group: closestToNow.group,
                    logged : (user.attendance == undefined || user.attendance.filter(a => a.event == closestToNow._id).length == 0) ? false : true

                }}));
            }else{
                res.status(401).send(JSON.stringify({successful: false}));
            }
            
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
})

app.get("/group/user", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            console.log(req.query.id);
            var getUser = (await m.getDocs('Account', {_id: req.query.id}))[0];
            
            var ownUser = false;
            
            if(getUser.id == req.query.id){
                getUser = await createSafeUser(getUser, 2);
                ownUser = true;
            }else{
                getUser = await createSafeUser(getUser, 1);
            }
            var group = (await m.getDocs('Group', {uniqueId: getUser.group}))[0];




            res.send(JSON.stringify({successful: true, user: getUser, ownUser: ownUser, group: group}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    
    });
});

app.post("/group/user", async function(req, res){
    isAuthenticated(req, "cookie",[], async function(status, user){
        if(status){
            var _id = req.body.id;
            var userCurrently = (await m.getDocs('Account', {_id: _id}))[0];
            if(req.body.action == "edit"){
                
                userCurrently.access.groups = req.body.subgroups;
                userCurrently.access.role = req.body.role;
                await m.updateDoc('Account', {_id: _id}, {
                    username: req.body.username,
                    email: req.body.email,
                    fullname: req.body.fullname,
                    access: userCurrently.access,
                    notes: req.body.notes

                });
            }else if(req.body.action == "delete"){
                await m.deleteDoc('Account', {_id: _id});
            }
            
           




            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    
    });
});

app.post("/group/today", async function(req, res){
    isAuthenticated(req, "cookie",["VIEW_SCHEDULE_SIGNIN"], async function(status, user){
        if(status){

            user = await m.getDocs('Account', {_id: user.id});
            user = user[0];
            //console.log(user);
            

            var docs = await m.getDocs('AttendanceItem', {group: user.group});
            var closestToNow = getTodaysEvent(docs);
            

            if(user.attendance == undefined || user.attendance.filter(a => a.event == closestToNow._id).length == 0){
                // add attendance record
                var toUpdate = {
                    attendance : user.attendance == undefined ? [] : user.attendance
                };
                toUpdate.attendance.push({
                    event: closestToNow._id,
                    status: "ATTEND",
                    overriddenstatus: "",
                    datetime: new Date()
                });
                
                console.log(toUpdate);
                await m.updateDoc('Account', {_id: user._id}, toUpdate);
            }
            res.send(JSON.stringify({successful: true}));
        }else{
            res.status(401).send(JSON.stringify({successful: false}));
        }
    });
});

app.get("/group/accounts", function(req, res){
    isAuthenticated(req, "cookie",["*", "ADMIN_REPRESENTATIVE"], function(status, user){
        if(status){
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/accounts.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }else{
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/home.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }
    });
});
app.get("/group/manage", function(req, res){
    isAuthenticated(req, "cookie",["*", "ADMIN_LANDING", "ADMIN_QUICKLINKS"], function(status, user){
        if(status){
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/manage.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }else{
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/home.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }
    });
});

app.get("/acc/user*", function(req, res){
    isAuthenticated(req, "cookie",[], function(status, user){
        if(status){
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/user.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }else{
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/home.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }
    });
});

app.get("/group/cable", function(req, res){
    isAuthenticated(req, "cookie",[], function(status, user){
        if(status){
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/cable.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }else{
            if(req.headers["partial"] == "YES"){
                res.sendFile(__dirname + "/views/home.html");
            }else{
                res.sendFile(__dirname + "/views/base.html");
            }
        }
    });
});

app.use(async function(req, res, next) {
    // this is the 404 route
    if(req.originalUrl.includes("/ql/")){
        var quickLinks = await m.getDocs('QuickLink', {});
        var sent = false;
        
        quickLinks.forEach(e => {
            console.log(e.from);
            console.log(req.originalUrl)
            if(req.originalUrl == "/ql/" + e.from){
                console.log("QUICK LINK");
                

                isAuthenticated(req, "cookie",[], async function(status, user){
                    console.log(user)
                    if(status){
                        if(e.visitors == undefined){
                            e.visitors = [user.id];
                        }else if(!e.visitors.includes(user.id)){
                            e.visitors.push(user.id);
                        }
                        res.redirect(e.to);
                        sent = true;
                        
                        await m.updateDoc('QuickLink', {_id: e._id}, {visitors: e.visitors});
                    }else{
                        console.log("Not authenticated")
                        if(e.restricted == false){
                            res.setHeader("to", e.to);
                            res.setHeader("group", e.group);
                            res.cookie("to", e.to);
                            res.cookie("group", e.group);
                            res.sendFile(__dirname + "/views/tolink.html");
                            
                            sent = true;
                        }
                    }
                    console.log(e.visitors);
                });
                
                
            }
        });
    }
    // if(!sent && req.originalUrl.includes("/group/")){
    //     var group = req.originalUrl.split("/")[2];
    //     var groupItem = await m.getDocs('Group', {uniqueId: group});
    //     if(groupItem.length > 0){
    //         groupItem = groupItem[0];
    //         sent = true;
    //     }

        
    // }
    if(!sent){
        res.status(404).send("Sorry, that route doesn't exist. Have a nice day :)");
    }
    
});

// start the server in the port 3000 !
app.listen(8080, function () {
    console.log('Example app listening on port 3000.');
});