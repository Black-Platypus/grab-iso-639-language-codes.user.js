{
// ==UserScript==
// @name		Grab ISO 639 language codes
// @description	
// @version		1.0.0
// @downloadURL	https://github.com/Black-Platypus/grab-iso-639-language-codes.user.js/raw/refs/heads/main/grab-iso-639-language-codes.user.js
// @updateURL	https://github.com/Black-Platypus/grab-iso-639-language-codes.user.js/raw/refs/heads/main/grab-iso-639-language-codes.user.js
// @namespace	BP
// @author		Benjamin Philipp <dev [at - please don't spam] benjamin-philipp.com>
// @include		https://iso639-3.sil.org/code_tables/639/data*
// @require 	https://ajax.googleapis.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @require 	https://benjamin-philipp.com/js/gm/funcs.js
// @run-at		document-body
// @noframes
// @grant		GM_addStyle
// @grant		GM_download
// @grant		GM_info
// @grant		GM_setClipboard
// @grant		GM_xmlhttpRequest
// @connect		*
// ==/UserScript==
// BP-template-version	2025-09-10
} // Head

const logger = new BPLogger(GM_info.script.name);
const {log, warn, error, success} = logger;
const modal = bpModal();

const sels = {
	table: "#block-system-main>.view-code-tables>.view-content table.views-table",
	pagination: "#block-system-main>.view-code-tables>ul.pager",
	paginationNext: "li.pager-next>a"
};

const urlTemplate = "https://iso639-3.sil.org/code_tables/639/data/all?items_per_page=500&page=%d";

// const preferBib = false; // Prefer Bibliographical over terminilogical codes? https://en.wikipedia.org/wiki/ISO_639-2#B_and_T_codes
const keepDeprecated = false;

const codes = ["639-1", "639-2", "639-3"];
const cols = {
	"639-1": {column: 2, expected_length: 2},
	"639-2": {column: 1, expected_length: 3, label: "639-2/639-5"},
	"639-3": {column: 0, expected_length: 3},
	name: {column: 3, label: "Language Name(s)"},
	scope: {column: 4, label: "Scope"},
	type: {column: 5, label: "Language Type"}
};

{GM_addStyle(`
	#bp-floatButtons{
		position: fixed;
		top: 3em;
		right: 1em;
		display: flex;
		gap: 0.5em;
	}
	.bp-button{
		background: #ddd;
		padding: 0.5em;
		font-weight: 700;
		color: #000;
		cursor: pointer;
		opacity: 0.8;
		border: 1px solid #8888;
	}
	.bp-button+.bp-button{
		margin-left: 0.5em;
	}
	.bp-button:hover{
		opacity: 1;
	}
	
	.bpModback .modbox,
	.bp-resultOptions{
		background: #eee;
		color: #111;
	}
	
	.bp-resultOptions h2{
		margin-top: 0;
	}
	.bp-resultOptions label{
		font-weight: 500;
		white-space: nowrap;
		margin: 0;
	}
	
	.bp-resultOptions>table{
		margin: 0.5em 0;
	}
	.bp-resultOptions>table td{
		padding: 0.25em 0.5em;
		vertical-align: middle;
		border: 1px solid #8888;
	}
	.bp-resultOptions td.codeScope{
		white-space: nowrap;
	}
	.bp-resultOptions td.codeScope>span.name{
		font-weight: 900;
	}
	.bp-resultOptions td.buttons{
		font-size: 80%;
		padding: 0.25em 0.5em;
	}
	
	.progress.marquee{
		background: linear-gradient(-45deg, #bdf, #38c, #bdf, #38c, #bdf);
		background-size: 220%;
		animation: marquee 2s linear infinite;
	}

	@keyframes marquee{
		0%{
			background-position: 100% 000%;
		}
		100%{
			background-position: 00% 000%;
		}
	}
`);
} // Styles. In block to make it collapsable in TM Editor

const btRex = /639-2\/([BT]):\s*(\w+)/i;

function main(){
	waitFor(sels.table, function(o){
		let menu = $("<div id='bp-floatButtons'></div>").appendTo("body");
		let getPageButton = $("<div class='bp-button' title='Get all data from current page'>Get all on page</div>").appendTo(menu).click((ev)=>{
			// log("get all on page");
			let res = getFromTable(o);
			log("result:", res);
			
			// Check in on alt names
			// let multiName = Object.values(res).filter(v=>v.names_other.length>0);
			// log("Multiple names:", multiName);
			
			resultDialog(res);
		});
		let getAllButton = $("<div class='bp-button'>Get all</div>").appendTo(menu).click(async (ev)=>{
			
			let progDiag = $(`<div class='progDiag'>
				<p>Loading page <span class='counter page'>1</span></p>
				<p>Found rows: <span class='counter row'>0</span></p>
				<div class='progress marquee'></div>
			</div>`);
			let counters = {
				page: progDiag.find("span.counter.page"),
				row: progDiag.find("span.counter.row")
			}
			let diag;
			let controller = getAll((res, err)=>{
				log("result all:", res, err);
				//diag.close();
				resultDialog(res);
			}, (data)=>{
				const {page, rows, lastRow} = data;
				counters.page.text(page + 1);
				counters.row.text(rows);
			});
			progDiag.append("<button class='bp-button'>Cancel</button>").click(()=>{
				controller.cancel();
			});
			diag = modal.msg(progDiag);
		});
	}); //, cbFail=null, findIn="document", delay=500, maxTries=50, alwaysOn=false, debug = false
	{
	// 	GM_xmlhttpRequest({
	// 		method: "GET",
	// 		url: url,
	// 		onload: function(res){
	// 			let r = res.response;
	// 			let t = res.responseText;
	// 			log(res, r, t);
	// 		}
	// 	});
	// 	GM_openInTab(url, {
	// 		active: true,
	// 		insert: true,
	// 		parent: true
	// 	});
	// 	GM_download({
	// 		url: url,
	// 		name: name,
	// 		saveAs: false,
	// 		onerror: function(e){
	// 			error("Error:", e);
	// 		},
	// 		onload: function(){
	// 			success("Downloaded");
	// 		}
	// 	});
	// 	saveAs(url, name, dir, cbOrPromise=true, cbErr=false, ifExist="ask");
	} // Things I keep forgetting
	
	exposeAll({$, log, warn, error, sels});
	bpVars.unpackNew(true);
}

function resultDialog(res, errors){
	let dlg;
	let els = $("<div class='bp-resultOptions'><h2>Got data: " + (res).length + " rows</h2></div>");
	let pretty = $("<input id='resultPretty' type='checkbox' checked='checked' />").prependTo($("<label for='resultPretty'> Pretty print</label>").appendTo(els));
	// els.append("<br />");
	let tbl = $(`<table>`).appendTo(els);
	let keyed = {};
	let simple = {};
	for(let k of codes){
		keyed[k] = {};
		simple[k] = {};
		let vals = res.filter(v=>!!v[k]);
		for(let val of vals){
			keyed[k][val[k]] = val;
			simple[k][val[k]] = val.name;
		}
		let row = $("<tr><td class='codeScope'><span class='name'>" + k + "</span><br />(" + vals.length + " items)</td>").appendTo(tbl);
		let safeKey = k.replace(/[^a-zA-Z0-9]/g, "-");
		let td = $("<td class='objType'>").appendTo(row);
		let asObject = $(`<input type='radio' id='${safeKey}-asObject' name='${safeKey}-objectOrArray' checked='checked' />`).prependTo($(`<label for='${safeKey}-asObject'> As keyed Object</label>`).appendTo(td));
		$("<br />").appendTo(td);
		let asSimpleObject = $(`<input type='radio' id='${safeKey}-asSimple' name='${safeKey}-objectOrArray' />`).prependTo($(`<label for='${safeKey}-asSimple'> As simple Object (code=&gt;name)</label>`).appendTo(td));
		$("<br />").appendTo(td);
		$(`<input type='radio' id='${safeKey}-asArray' name='${safeKey}-objectOrArray' />`).prependTo($(`<label for='${safeKey}-asArray'> As Array</label>`).appendTo(td));
		
		td = $("<td class='buttons'>").appendTo(row);
		
		let getText = function(){
			let isPretty = pretty.is(":checked");
			let isObject = asObject.is(":checked");
			let isSimple = asSimpleObject.is(":checked");
			let vals = keyed[k];
			if(!isObject){
				if(isSimple)
					vals = simple[k];
				else
					vals = Object.values(vals);
			}
			log({k, isPretty, isObject, vals});
			return JSON.stringify(vals, undefined, isPretty ? "\t" : undefined);
		}
		
		$("<button class='bp-button'>Copy</button>").appendTo(td).click(()=>{
			const str = `/* ${k} language codes */\n` + getText();
			GM_setClipboard(str);
			// dlg.close();
		});
		// $("<br />").appendTo(td);
		$("<button class='bp-button' title='Ctrl: Ask for location'>Download</button>").appendTo(td).click((ev)=>{
			const str = getText();
			GM_download({
				url: "data:application/octet-stream," + encodeURIComponent(str),
				name: safeKey + "-language_codes.json",
				saveAs: ev.ctrlKey,
				onerror: function(e){
					error(e);
					msgError(e);
				},
				onload: function(){
					msgSuccess("Downloaded");
				}
			});
			// dlg.close();
		});
	}
	$("<button class='bp-button'>Copy all</button>").appendTo(els).click(()=>{
		const str = JSON.stringify(res, undefined, pretty.is(":checked") ? "\t" : undefined);
		GM_setClipboard(str);
		// dlg.close();
	});
	$("<button class='bp-button' title='Ctrl: Ask for location'>Download all</button>").appendTo(els).click((ev)=>{
		const str = JSON.stringify(res, undefined, pretty.is(":checked") ? "\t" : undefined);
			GM_download({
				url: "data:application/octet-stream," + encodeURIComponent(str),
				name: "language_codes.json",
				saveAs: ev.ctrlKey,
				onerror: function(e){
					error(e);
					msgError(e);
				},
				onload: function(){
					msgSuccess("Downloaded");
				}
			});
		// dlg.close();
	});
	dlg = modal.msg(els);
}

function getFromTable(tables){
	let ret = [];
	tables.each((i,e)=>{
		let table = $(e);
		let thisCols = {};
		let headers = {};
		table.find(">thead>tr>th").each((i,e)=>{
			// log("th:", $(e).text().trim(), i);
			headers[$(e).text().trim()] = i;
		});
		// log("headers:", headers);
		for(let k in cols){ // AAAARGH! They drop columns if a table section doesn't have any entries there
			let v = cols[k];
			let label = v.label || k;
			let hd = headers[label];
			// log("is num?", k, label, hd);
			if(typeof hd == "number"){
				thisCols[k] = Object.assign({}, v);
				thisCols[k].column = hd;
				// log("is num:", k, label, hd, thisCols[k]);
			}
		}
		// log("cols:", thisCols);
		$(table).find(">tbody>tr").each((i,e)=>{
			let ok = true;
			let row = {
				"639-1": "",
				"639-2": "",
				"639-2/B": "",
				"639-3": ""
			};
			let key;
			for(let k in thisCols){
				let n = thisCols[k].column;
				let td = $(e).children("td").get(n);
				if(!td){
					error("Column entry not found:", n, k, e);
					ok = false;
					break;
				}
				let v = $(td).textBr().trim();
				if(k=="name"){
					if(!v)
						v = "undefined";

					// let arr = v.split(/\s*\n\s*/g);
					// v = arr[0];
					// row.names_other = arr.slice(1);
					let names = $(td).find("span.sorted-language-names>div");
					if(!names.length){
						warn("no names:", td, e);
					}
					// log("names:", names, Array.from(names));
					let arr = Array.from(names).map((e)=>$(e).text().trim());
					v = arr[0];
					row.names_other = arr.slice(1);
					// if($(td).text().trim().indexOf(",") && row.names_other.length<1){ // nvm, there is no actual comma
					// 	warn("Alt language names not caught?", td, e);
					// }
				}
				else{
					// if(n===0)
					// 	key = v;
					if(v?.length){
						let el = cols[k].expected_length;
						let m = v.matches(/(\w+)\s+\(deprecated\)/);
						if(m){
							if(! keepDeprecated){
								warn("skipping deprecated entry:", k, m[1], nextUrl);
								return;
							}
							v = m[1];
						}
						if(el){
							if(v.length != el){
								let ov = v;
								let m = getMatches(ov, btRex);
								if(m){
									for(let mm of m){
										if(mm[1] == "B")
											row["639-2/B"] = mm[2];
										else if(mm[1] == "T")
											v = mm[2].trim();
										else
											error("unknown code type:", ov, td, e);
									}
								}
							}
							if(v.length != el){
								error("not expected length:", v, "!=", el, td, e);
								return false;
							}
						}
					}
				}
				row[k] = v;
			}
			if(!ok)
				return false;
	// 		if(!key){

	// 		}
			// if(ret[key])
			// 	warn("Key already exists:", key);
			// ret[key] = row;
			ret.push(row);
			// if(row.names_other.length){
			// 	log("first multi result:", row, e);
			// 	return false;
			// }
		});
	});
	return ret;
}

let crawlPage = 0;
let errors = [];
let nextUrl = urlTemplate.replace("%d", crawlPage);

function addError(err, ...args){
	errors.push([err, {page: crawlPage, url: nextUrl}, ...args]);
}

function getAll(cb, onUpdate, interval=1000){
	crawlPage=0;
	errors = [];
	
	nextUrl = urlTemplate.replace("%d", crawlPage);
	let requestCancel = false;
	let r = {cancel: function(){
		requestCancel = true;
	}};
	let currentInterval = interval;
	let results = [];
	if(!onUpdate)
		onUpdate = ()=>{};
	(async ()=>{
		while(nextUrl){
			if(requestCancel)
				break;
			let res = await new Promise((resolve)=>{
				GM_xmlhttpRequest({
					method: "GET",
					url: nextUrl,
					onload: function(res){
						currentInterval = interval;
						let r = res.response;
						let t = res.responseText;
						log(nextUrl);
						// log({res, r, t});
						let cont = $("<div>" + t + "</div>");
						let table = cont.find(sels.table);
						let pagNext = cont.find(sels.pagination + " " + sels.paginationNext);
						if(! table?.length){
							let err = ["Could not find table in document:", cont, t];
							error(...err);
							addError(...err);
							resolve(false);
						}
						let rows = getFromTable(table);
						if(rows?.length){
							results.push(...rows);
							if(! pagNext?.length)
								nextUrl = false;
							else
								nextUrl = new URL(pagNext.first().attr("href"), location.origin).toString();
						}
						else{
							let err = ["Could not ret rows from table:", table, t];
							error(...err);
							addError(...err);
							resolve(false);
						}
						// log(nextUrl);
						// nextUrl = false; // for testing: only first page
						crawlPage++;
						onUpdate({page: crawlPage, rows: results.length, lastRow: results[results.length-1]});
						resolve(true);
					},
					onerror: function(err){
						error(err);
						addError(err);
						nextUrl = false;
						resolve(false);
					}
				});
			});
			if(requestCancel || !res || !nextUrl)
				break;
			await bpWait(currentInterval);
		}
		cb(results, errors);
	})();
	return r;
}

setTimeout(main, 0);

/* 2025-09-10 */
/* eslint-env browser, es6 */
/* eslint no-trailing-spaces: 0, curly: 0, no-redeclare: 0 */
/* globals $, unsafeWindow, GM_config, escape, uneval, BPLogger, BPLogger_default, log, error, warn, getParam, waitFor, bpMenu, bpModal, escapeHtml, saveText, localTask, msg, saveAs, encodeBase64, jsPretty, sanitize, expose, exposeAll, getMatches, bpVars: true, msgSuccess, msgError, msgWarn, bpFloatContainer, bpWait */
