/* 
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED 
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES 
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, 
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES 
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR 
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) 
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, 
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING 
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE 
 * POSSIBILITY OF SUCH DAMAGE. 
 */     

/**
 * curry function ripped from http://ejohn.org/blog/partial-functions-in-javascript/
 */
Function.prototype.rubyMurray = function() {
  var fn = this;
  var args = Array.prototype.slice.call(arguments);
  return function() {
    return fn.apply(this, args.concat(Array.prototype.slice.call(arguments)));
  };
};



var he={};
(function() {
  he.compiledPartialsUrl = undefined;
  he.templateIdentifier = "text/template";
  //he.extract = new RegExp("(\\<\\!\\-\\-\\{)(.*)(\\}\\-\\-\\>)");
  he.extract = new RegExp('(he\\.include\\(\\")(.*)(\\"\\))');
  //he.startMarker = "<!--{";
  he.startMarker = 'he.include("';
  //he.endMarker = '")';
  he.endMarker = '")';
  he.templates = {};
  he.queue = [];



  /**
   * read config from page
   */ 
  he.readConfig = function() {
    var script = $("#helium-config").html();
    if (script) {
      config = JSON.parse(script);
      if (config && config.compiledPartialsUrl) {
        he.compiledPartialsUrl = config.compiledPartialsUrl;
      }
      if (config && config.templateIdentifier) {
        he.templateIdentifier = config.templateIdentifier;
      }
    }
  };



  /**
   * identify partial/template script tags in the page and process them. 
   * Partials are identified by he.templateIdentifier
   * will attempt to fetch all partials, if a compressed partial block is not available then
   * will attempt to fetch partials one at a time
   */
  he.partials = function(callback) {
    var allScripts = document.getElementsByTagName("script");
    var scripts = [];
    var idx;

    for (idx in allScripts) {
      if (allScripts[idx].type === he.templateIdentifier) {
        he.queue.push({script: allScripts[idx], html: allScripts[idx].innerHTML});
        //he.templates[allScripts[idx].type.id] = allScripts[idx];
        he.templates[allScripts[idx].id] = allScripts[idx];
      }
    }
    he.processPartials(he.queue, callback);
  };



  /**
   * recursively process templates/partials
   * a template block may contain inline code and partial tags, all partial
   * tags will be injected until the block is fully inline
   */ 
  he.processPartials = function(queue, callback) {
    var context = queue[0];
    var partial = null;
    var json;

    while (context && context.processed && queue.length > 0) {
      if (context.script) {
        context.script.text = context.html;
      }
      queue.shift();
      context = queue[0];
    }

    if (context && !context.processed) {
      he.extract.lastIndex = 0;
      if (null === (partial = he.extract.exec(context.html))) {

        // template is fully inline all partials injected
        context.processed = true;
        he.processPartials(queue, callback);
      }
      else {
        // template contains partials
        //json = JSON.parse("{" + partial[2] + "}");
        json = JSON.parse('{"partial": "' + partial[2] + '"}');
        p = { src: json.partial, name: he.derivePartialName(json) };
        he.processPartial(queue, p, callback);
      }
    }
    else {
      callback();
    }
  };



  /**
   * process an individual partial
   * Will attempt to fetch the partial from the page if available
   * otherwise will attempt to fetch the partial using the url attribute
   */
  he.processPartial = function(queue, p, callback) {
    var splt = p.src.split("/");
    var tname = splt[splt.length - 1].split(".")[0];

    if ($("#" + tname).length > 0) {
      //he.injectPartial(this.queue, $("#" + tname).html());
      //he.processPartials(this.queue, callback);
      he.injectPartial(queue, $("#" + tname).html());
      he.processPartials(queue, callback);
    }
    else {
      $.ajax({url: p.src,
              dataType: "html",
              context: {queue: queue, p: p}, 
              success: function(data, textStatus, jqXHR) {
                he.injectPartial(queue, data);
                he.processPartials(queue, callback);
              },
              error: function(jqXHR, textStatus, errorThrown) {
                he.injectPartial(queue, jqXHR.status + " " + jqXHR.statusText + ": " + jqXHR.responseText);
                he.processPartials(queue, callback);
              }});
    }
  };



  /**
   * inject the partial into the page at the point of declaration
   */
  he.injectPartial = function(queue, data) {
    var context = queue[0];
    var html = context.html;
    var pos = 0;
    var end;
    var newHtml;

    pos = html.indexOf(he.startMarker);
    end = html.indexOf(he.endMarker);
    newHtml = html.substring(0, pos);
    newHtml += data;
    newHtml += html.substring(end + he.endMarker.length);
    context.html = newHtml;
  };



  /**
   * derive partial name from url
   * given a url of the form "/one/two/three/name.html"
   * will return "name"
   */
  he.derivePartialName = function(json) {
    var split = json.partial.split("/");
    return split[split.length - 1].split(".")[0];
  };



  /**
   * interate over the template definitions and create template objects
   */
  he.instantiate = function() {
    var idx;
    for (idx in he.templates) {
      var object = $("#" + idx);
      if (!he[idx]) {
        //he.templates[idx] = he.returnTemplate.rubyMurray(template);
        he[idx] = he.executeTemplate.rubyMurray(he.templates[idx]);
      }
    }
  };



  /**
   * return the compiled template, compile on first use
   */
  he.executeTemplate = function(template, data) {
    if (!template.compiled) {
      he.compileTemplate(template);
    }
    return template.compiled(data);
  };



  /**
   * return the compiled template, compile on first use
   */
  he.returnTemplate = function(template) {
    if (!template.compiled) {
      he.compileTemplate(template);
    }
    return template.compiled;
  };



  /**
   * compile and return the template
   */
  he.compileTemplate = function(template) {
    var sourceHtml = template.text;
    template.compiled = _.template(sourceHtml);
  };



  /**
   * kick off template loading
   */
  he.bootstrap = function(callback) {
    he.readConfig();
    he.partials(function() {
      he.instantiate();
      callback();
    });
  };
})();

