#!/usr/bin/env node

var fs  = require("fs.extra")
,   pth = require("path")
,   exec = require("child_process").exec
,   jsdom = require("jsdom")
,   wrench = require("wrench")
;

// basic setup
var target = process.argv[2] || "html"
,   fullConf = {
        html:   {
            outDir:     "heartbeat"
        ,   make:       "html"
        ,   makeDir:    "output/html/"
        }
    ,   "2d":    {
            outDir:     "heartbeat-2d"
        ,   make:       "2dcontext"
        ,   makeDir:    "output/2dcontext/"
        }
    ,   microdata:    {
            outDir:     "heartbeat-md"
        ,   make:       "microdata"
        ,   makeDir:    "output/microdata/"
        }
    }
,   conf = fullConf[target]
,   rootDir = pth.join(__dirname, "..")
,   hbDir = pth.join(rootDir, conf.outDir)
;

function rename (src, to) {
    try {
        fs.renameSync(src, to);
    }
    catch (e) {
        console.log("Error renaming " + src + " to " + to);
    }
}

if (fs.existsSync(hbDir)) wrench.rmdirSyncRecursive(hbDir);
fs.mkdirSync(hbDir);

function finalise () {
    // copy the images
    var imgDir = pth.join(hbDir, "images")
    ,   fontDir = pth.join(hbDir, "fonts")
    ;
    if (target !== "microdata") fs.mkdirSync(imgDir);
    fs.mkdirSync(fontDir);
    if (target !== "microdata") wrench.copyDirSyncRecursive(pth.join(rootDir, "images/"), imgDir);
    wrench.copyDirSyncRecursive(pth.join(rootDir, "fonts/"), fontDir);
    
    console.log([   "The specification has been generated. You may now wish to:"
                ,   "\t\u2022 Run the link checker on everything (link-checker.js)"
                ,   "\t\u2022 Run pubrules on everything (pubrules.js)"
                 ].join("\n"));
}

// build the spec
exec("make " + conf.make, { cwd: rootDir }, function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
    if (err) throw err;
    wrench.copyDirSyncRecursive(pth.join(rootDir, conf.makeDir), hbDir);
    // file renames
    if (target === "html") {
        // in every single file in there, replace spec.html with index.html
        var files = fs.readdirSync(hbDir)
        ,   notFoundDir = pth.join(rootDir, "404/")
        ,   files404 = fs.readdirSync(notFoundDir)
        ;
        for (var i = 0, n = files404.length; i < n; i++) {
            var f4 = files404[i];
            fs.copy(pth.join(notFoundDir, f4), pth.join(hbDir, f4));
        }

        for (var i = 0, n = files.length; i < n; i++) {
            var file = pth.join(hbDir, files[i]);
            if (!file.match(/\.html$/)) continue;
            var content = fs.readFileSync(file, "utf-8");
            // the below looks weird because for reasons beyond human understanding,
            // JS does not support zero-width negative lookbehinds
            content = content
                        .replace(/src: url\('..\/fonts\/Essays1743/g, "src: url('fonts/Essays1743")
                        ;
            fs.writeFileSync(file, content, "utf-8");
        }
    }
    else if (target === "2d" || target === "microdata") {
        var file = pth.join(hbDir, "Overview.html")
        ,   content = fs.readFileSync(file, "utf-8");
        content = content
                    .replace(/src: url\('..\/fonts\/Essays1743/g, "src: url('fonts/Essays1743");
        fs.writeFileSync(file, content, "utf-8");
    }
    if (target === "microdata") {
        // move HTMLPropsCol section around
        var file = pth.join(hbDir, "Overview.html");
        jsdom.env(
            file
        ,   [pth.join(rootDir, "scripts/jquery.min.js")]
        ,   function (err, window) {
                if (err) return console.log(err);
                var $ = window.$
                ,   doc = window.document
                ;
                // move HTMLProp to inside Microdata APIs
                var $toc = $("ol.toc").first()
                ,   $mdOL = $toc.find("a[href=#htmlpropertiescollection]").parent().parent()
                ,   $apiLI = $toc.find("a[href=#microdata-dom-api]").parent()
                ;
                $apiLI.append($mdOL);
                
                //  - also move the actual section
                var $hpTit = $("#htmlpropertiescollection")
                ,   sectionContent = [$hpTit]
                ,   $nxt = $hpTit.next()
                ;
                while (true) {
                    if ($nxt.is("h1,h2,h3,h4,h5,h6")) break;
                    sectionContent.push($nxt);
                    $nxt = $nxt.next();
                }
                var $other = $("#other-changes-to-html5");
                for (var i = 0, n = sectionContent.length; i < n; i++) $other.before(sectionContent[i]);
                
                // fixing the numbering, HARDCODED in the hope that we'll get a fix
                var fixNum = function ($target) {
                    $target.find(".secno").first().text("6.1 ");
                };
                fixNum($mdOL);
                fixNum($hpTit);
                console.log("WARNING: applying hardcoded section numbering fix, please check.");
                
                // serialise back to disk...
                $(".jsdom").remove();
                fs.writeFileSync(file, doc.doctype.toString() + doc.innerHTML, "utf8");
                
                finalise();
            }
        );
    
    }
    else {
        finalise();
    }
});
