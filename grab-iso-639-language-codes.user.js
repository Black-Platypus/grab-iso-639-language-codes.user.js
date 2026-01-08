{
// ==UserScript==
// @name		Grab ISO 639 language codes
// @description	
// @version		1.1.0
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
const modal = bpModal("light");

const sels = {
	table: "#block-system-main>.view-code-tables>.view-content table.views-table",
	pagination: "#block-system-main>.view-code-tables>ul.pager",
	paginationNext: "li.pager-next>a"
};

const sourceUrl = "https://iso639-3.sil.org/code_tables/639/data/all";
const scriptUrl = "https://github.com/Black-Platypus/grab-iso-639-language-codes.user.js";
const urlTemplate = "https://iso639-3.sil.org/code_tables/639/data/all?items_per_page=500&page=%d";

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

// Some of the results are duplicated, like there is a clone for the 639-2/B code, sorted as if the 639-3 had the 639-2/B as its value
const knownDupes = [
	"ces",
	"eus",
	"fra",
	"deu",
	"ell",
	"hye",
	"isl",
	"kat",
	"mkd",
	"mri",
	"msa",
	"mya",
	"nld",
	"fas",
	"ron",
	"slk",
	"sqi",
	"bod",
	"cym",
	"zho"
];

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
	.bp-resultOptions>label{
		margin-right: 0.5em;
	}
	
	.nowrap{
		white-space: nowrap;
	}
	span.counter.row{
		white-space: nowrap;
		break-before: avoid;
		margin: 0;
	}
	span.counter.row::before,
	span.counter.row::after{
		content: none;
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
	
	.bp-collapse{
		
	}
	.bp-collapse>div{
	}
	.bp-collapse>.bp-collapse-wrapper{
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.3s ease-out;
	}
	.bp-collapse.open>.bp-collapse-wrapper{
		grid-template-rows: 1fr;
	}
	.bp-collapse>.bp-collapse-wrapper>.bp-collapse-container{
		overflow: hidden;
	}
	.bp-collapse .bp-collapse-title{
		cursor: pointer;
	}
	.bp-collapse .bp-collapse-title::after{
		content: " ▼";
		opacity: 0.5;
	}
	.bp-collapse .bp-collapse-title:hover::after{
		opacity: 1;
	}
	.bp-collapse.open .bp-collapse-title::after{
		content: " ▲";
	}
`);
} // Styles. In block to make it collapsable in TM Editor

const btRex = /639-2\/([BT]):\s*(\w+)/i;

let isOnlyPage, isComplete, isSubset, isCustom, customUrl;

function main(){
	waitFor(sels.table, function(o){
		let menu = $("<div id='bp-floatButtons'></div>").appendTo("body");
		let getPageButton = $("<div class='bp-button' title='Get all data from current page'>Get all on page</div>").appendTo(menu).click((ev)=>{
			// log("get all on page");
			errors = [];
			let res = getFromTable(o);
			log("result:", res);
			
			// Test: Check in on alt names
			// let multiName = Object.values(res).filter(v=>v.names_other.length>0);
			// log("Multiple names:", multiName);
			// addError("Test", "toast", o[0]);
			
			isOnlyPage = true;
			customUrl = location.href;
			isSubset = true;
			resultDialog(res);
		});
		let getAllButton = $("<div class='bp-button' title='Ctrl: start from this page (including filters)'>Get all</div>").appendTo(menu).click(async (ev)=>{
			// log("get all");
			let progDiag = $(`<div class='progDiag'>
				<p class='nowrap'>Loading page <span class='counter page'>1</span></p>
				<p class='nowrap'>Found rows: <span class='counter row'>0</span></p>
				<div class='progress marquee'></div>
			</div>`);
			let counters = {
				page: progDiag.find("span.counter.page"),
				row: progDiag.find("span.counter.row")
			}
			let diag;
			let controller;
			progDiag.append("<button class='bp-button'>Cancel</button>").click(()=>{
				isComplete = false;
				controller.cancel();
			});
			diag = modal.msg(progDiag);
			
			nextUrl = urlTemplate.replace("%d", 0);
			
			isCustom = ev.ctrlKey;
			if(isCustom){
				nextUrl = location.href;
				customUrl = location.href;
			}
			const url = new URL(nextUrl);
			url.searchParams.set("items_per_page", 500);
			url.searchParams.set("page", 0);
			nextUrl = url.toString();
			
			isComplete = true;
			isSubset = false;
			isOnlyPage = false;
			if(isCustom){
				if(! url.pathname.match("/data/all"))
					isSubset = true;
				else {
					for(let filterKey in filterFields){
						if(isSubset)
							break;
						let filter = filterFields[filterKey];
						let defValue = filter.default.toLowerCase();
						let v = url.searchParams.get(filterKey);
						if(!v)
							continue;
						if(v.toLowerCase() != defValue){
							log(`${filterKey} is not default '${defValue}':`, v);
							isSubset = true;
							break;
						}
					}
				}
			}
			// return msg("Is subset? " + (isSubset ? "Yes" : "No"));
			
			controller = getAll((res, err)=>{
				// log("result all:", res, err);
				diag.close();
				resultDialog(res);
			}, (data)=>{
				const {page, rows, lastRow} = data;
				counters.page.text(page + 1);
				counters.row.text(rows);
			}, diag);
		});
	}); //, cbFail=null, findIn="document", delay=500, maxTries=50, alwaysOn=false, debug = false
}

const filterFields = {
	title: {
		name: "title",
		label: "Identifier",
		short: "title",
		default: ""
	},
	name_3: {
		name: "name_3",
		label: "Language Name(s) containing",
		short: "names",
		default: ""
	},
	field_iso639_cd_st_mmbrshp_639_1_tid: {
		name: "field_iso639_cd_st_mmbrshp_639_1_tid",
		label: "Code Set",
		short: "set",
		default: "All"
	},
	field_iso639_element_scope_tid: {
		name: "field_iso639_element_scope_tid",
		label: "Scope",
		short: "scope",
		default: "All"
	},
	field_iso639_language_type_tid: {
		name: "field_iso639_language_type_tid",
		label: "Language Type",
		short: "type",
		default: "All"
	}
};

function resultDialog(res){
	let dlg;
	let els = $("<div class='bp-resultOptions'><h2>Got data: " + (res).length + " rows</h2></div>");
	let pretty = $("<input id='resultPretty' type='checkbox' checked='checked' />").prependTo($("<label for='resultPretty'> Pretty print</label>").appendTo(els));
	let includeComments = $("<input id='withComments' type='checkbox' checked='checked' />").prependTo($("<label for='withComments'> Include comments</label>").appendTo(els));
	// els.append("<br />");
	let tbl = $(`<table>`).appendTo(els);
	let keyed = {};
	let simple = {};
	let date = dateString(null, "YYYY-MM-DD");
	let skipped = {};
	let filterSuffix = "";
	
	if(isOnlyPage || isCustom){
		let url = new URL(customUrl);
		let m = url.pathname.match(/\/data\/(\w+)/);
		if(m[1] != "all")
			filterSuffix += sanitizeSuffix(m[1]);
		
		for(let filterKey in filterFields){
			let filter = filterFields[filterKey];
			let defValue = filter.default.toLowerCase();
			let v = url.searchParams.get(filterKey);
			if(!v)
				continue;
			if(v.toLowerCase() != defValue){
				// log(`${filterKey} is not default '${defValue}':`, v);
				filterSuffix += "-" + filter.short + "=" + sanitizeSuffix(v);
			}
		}
		
		if(isOnlyPage){
			let page = url.searchParams.get("page");
			if(!page)
				page = "0";
			filterSuffix += "-page=" + page;
		}
	}
	// log({filterSuffix});
	
	for(let k of codes){
		keyed[k] = {};
		simple[k] = {};
		skipped[k] = {};
		let vals = res.filter(v=>!!v[k]);
		for(let val of vals){
			let existing = keyed[k][val[k]];
			if(existing){
				if(!skipped[k][val[k]])
					skipped[k][val[k]] = [structuredClone(existing)];
				log("adding skipped val:", jsPretty(val));
				skipped[k][val[k]].push(structuredClone(val));
			}
			
			// if(val.fromPage)
			// 	delete val.fromPage;
			
			keyed[k][val[k]] = val;
			
			simple[k][val[k]] = val.name;
		}
		
		vals = vals.map((val)=>{
			if(val.fromPage)
				delete val.fromPage;
			return val;
		});
		let ovals = structuredClone(vals);
		let row = $("<tr><td class='codeScope'><span class='name'>" + k + "</span><br />(" + vals.length + " items)</td>").appendTo(tbl);
		let safeKey = k.replace(/[^a-zA-Z0-9]/g, "-");
		let td = $("<td class='objType'>").appendTo(row);
		let asObject = $(`<input type='radio' id='${safeKey}-asObject' name='${safeKey}-objectOrArray' checked='checked' />`).prependTo($(`<label for='${safeKey}-asObject'> As keyed Object</label>`).appendTo(td));
		$("<br />").appendTo(td);
		let asSimpleObject = $(`<input type='radio' id='${safeKey}-asSimple' name='${safeKey}-objectOrArray' />`).prependTo($(`<label for='${safeKey}-asSimple'> As simple Object (code=&gt;name)</label>`).appendTo(td));
		$("<br />").appendTo(td);
		$(`<input type='radio' id='${safeKey}-asArray' name='${safeKey}-objectOrArray' />`).prependTo($(`<label for='${safeKey}-asArray'> As Array</label>`).appendTo(td));
		
		td = $("<td class='buttons'>").appendTo(row);
		
		let prepare = function(){
			let suffix = "";
			let comment = "";
			let isPretty = pretty.is(":checked");
			let isObject = asObject.is(":checked");
			let isSimple = asSimpleObject.is(":checked");
			let withComments = includeComments.is(":checked");
			
			// log("Prepare: closure context:", {k, asObject, isObject});
			
			if(isObject){
				vals = keyed[k];
				if(withComments)
					comment = `ISO ${k} language codes: Object with ${Object.keys(vals).length} entries as of ${date}
from ${sourceUrl}
using ${scriptUrl}
Entries are keyed by their ISO ${k} codes
(Entries without an ISO ${k} code are omitted)`;
			}
			else{
				if(isSimple){
					vals = simple[k];
					if(withComments)
						comment = `Dictionary [ISO ${k} => Language name] with ${Object.keys(vals).length} entries as of ${date}
from ${sourceUrl}
using ${scriptUrl}`;
					suffix = "_simple";
				}
				else{
					if(withComments)
						comment = `ISO ${k} language codes: Array with all ${ovals.length} entries as of ${date}
from ${sourceUrl}
using ${scriptUrl}
(Entries without an ISO ${k} code are omitted)`;
					suffix = "_array";
					vals = ovals;
				}
			}
			
			let text = (withComments ? commentFrame(comment) + "\n" : "") + JSON.stringify(vals, undefined, isPretty ? "\t" : undefined);
			
			suffix += filterSuffix;
			// log("Prepared:", {k, isPretty, isObject, returns: {text, suffix}, values: {vals, ovals}});
			return {text, suffix};
		}
		
		$("<button class='bp-button'>Copy</button>").appendTo(td).click(()=>{
			const str = prepare().text;
			GM_setClipboard(str);
			// dlg.close();
		});
		// $("<br />").appendTo(td);
		$("<button class='bp-button download' title='Ctrl: Ask for location'>Download</button>").appendTo(td).click((ev)=>{
			const prep = prepare();
			let withComments = includeComments.is(":checked");
			GM_download({
				url: "data:application/octet-stream," + encodeURIComponent(prep.text),
				name: "ISO_" + safeKey + "-language_codes" + prep.suffix + ".json" + (withComments ? "c" : ""),
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
	let skippedNum = 0;
	skipped["639-2"] = {};
	// log("before:", jsPretty(skipped));
	for(let k in skipped){
		let v = skipped[k];
		let c = 0;
		for(let _ in Object.keys(v))
			c++;
		skippedNum += c;
		if(c<=0)
			delete skipped[k];
	}
	// log("after:", jsPretty(skipped));
	
	if(skippedNum){
		let skippedMsg = $(`<div class='bp-collapse borderTop msg warn'>
		<div class='bp-collapse-title'>The following entries have been skipped (overwritten) for keyed objects:</div>`);
		$("<div class='bp-collapse-container pre'></div>").appendTo($("<div class='bp-collapse-wrapper pre'>").appendTo(skippedMsg)).html(jsPretty(skipped, true));
		warn("Skipped (overwritten) object entries:", skipped);
		skippedMsg.appendTo($("<div class='bpMessageStyles'>").appendTo(els));
	}
	if(errors?.length){
		msgError("test");
		let errorsMsg = $(`<div class='bp-collapse borderTop msg error'>
		<div class='bp-collapse-title'>The following errors occurred:</div>`);
		$("<div class='bp-collapse-container pre'></div>").appendTo($("<div class='bp-collapse-wrapper pre'>").appendTo(errorsMsg)).html(jsPretty(errors, true));
		error("Errors occurred:", errors);
		errorsMsg.appendTo($("<div class='bpMessageStyles'>").appendTo(els));
	}
	
	res = res.map((val)=>{
		if(val.fromPage)
			delete val.fromPage;
		return val;
	});
	
	const mainComment = commentFrame(`ISO 639 language codes: Array of${(isComplete && !isOnlyPage) ? " all" : ""} ${res.length} entries as of ${date}
from ${sourceUrl}
using ${scriptUrl}
Each entry will have at least one of 639-1, 639-2 or 639-3.
639-2/B: Bibliographic use instead of Terminological use.
  In practice, /B usually refers to the English name; /T to the endonym.
  /T is used as the default, where applicable.
  see https://en.wikipedia.org/wiki/ISO_639-2#B_and_T_codes`);
	
	$("<button class='bp-button'>Copy all</button>").appendTo(els).click(()=>{
		let withComments = includeComments.is(":checked");
		const comment = withComments ? mainComment + "\n" : "";
		const str = comment + JSON.stringify(res, undefined, pretty.is(":checked") ? "\t" : undefined);
		GM_setClipboard(str);
		// dlg.close();
	});
	const dlAll = $("<button class='bp-button' title='Ctrl: Ask for location'>Download all</button>").appendTo(els).click((ev)=>{
		let withComments = includeComments.is(":checked");
		const comment = withComments ? mainComment + "\n" : "";
		const str = comment + JSON.stringify(res, undefined, pretty.is(":checked") ? "\t" : undefined);
			GM_download({
				url: "data:application/octet-stream," + encodeURIComponent(str),
				name: "ISO_639-language_codes" + filterSuffix + ".json" + (withComments ? "c" : ""),
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
	$("<button class='bp-button' title='Download all variants as individual files'>Download all variants</button>").appendTo(els).click(async (ev)=>{
		await tbl.find("tr").asyncEachWait(async (i,e)=>{
			let dlb = $(e).find("button.bp-button.download");
			await $(e).find("input[type='radio']").asyncEachWait(async (ii,ie)=>{
				$(ie).prop("checked", true);
				await bpWait(400);
				// log("dl on", dlb, "for", ie);
				dlb.click();
				await bpWait(100);
			});
		});
		dlAll.click();
		// dlg.close();
	});
	dlg = modal.msg(els);
}

function sanitizeSuffix(str, strict=false){
	if(strict)
		return trimm(str).replace(/[^a-zA-Z0-9]/g, "_");
	return sanitize(trimm(str), false)
		.replace(/[\s-]+/g, "_");
}

$(document).on("click", ".bp-collapse .bp-collapse-title", (ev)=>{
	let cont = $(ev.target).closest(".bp-collapse");
	cont.toggleClass("open");
});

function commentFrame(str, minLength=0){
	let lines = str.split(/\r?\n/g);
	for(let l of lines)
		if(l.length>minLength) minLength=l.length;
	for(let i=0; i<lines.length; i++){
		let l = lines[i];
		let diff = minLength - l.length;
		if(diff>0)
			l += " ".repeat(diff);
		lines[i] = " * " + l + " *"
	}
	return "/" + "*".repeat(minLength+4) + "\n" + lines.join("\n") + "\n " + "*".repeat(minLength+4) + "/";
}

let haveDupes = [];

function getFromTable(tables, additionalData){
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
				if(k == "639-3"){
					if(haveDupes.includes(v)){
						log("skip dupe:", v);
						return;
					}
				}
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
								continue;
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
				
				if(k == "639-3"){
					if(knownDupes.includes(v)){
						haveDupes.push(v);
						// log("have known dupe:", v, haveDupes);
					}
				}
			}
			if(!ok)
				return false;
	// 		if(!key){

	// 		}
			// if(ret[key])
			// 	warn("Key already exists:", key);
			// ret[key] = row;
			if(additionalData)
				Object.assign(row, additionalData);
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
// let nextUrl = location.href;
let nextUrl = urlTemplate.replace("%d", crawlPage);

function addError(err, ...args){
	error(err, ...args);
	let obj = {error: err, page: crawlPage, url: nextUrl};
	let includeArgs = args.filter(arg=>{
		if(arg instanceof Element)
			return false;
		if(arg instanceof jQuery)
			return false;
		return true;
	});
	if(includeArgs.length)
		obj.args = includeArgs;
	errors.push(obj);
}

function getAll(cb, onUpdate, interval=1000){
	crawlPage=0;
	errors = [];
	
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
							// error(...err);
							addError(...err);
							resolve(false);
						}
						
						let rows = getFromTable(table, {fromPage: nextUrl});
						if(rows?.length){
							results.push(...rows);
							if(! pagNext?.length)
								nextUrl = false;
							else
								nextUrl = new URL(pagNext.first().attr("href"), location.origin).toString();
						}
						else{
							let err = ["Could not ret rows from table:", table, t];
							// error(...err);
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
						// error(err);
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
/* globals $, unsafeWindow, GM_config, escape, uneval, BPLogger, BPLogger_default, log, error, warn, getParam, waitFor, bpMenu, bpModal, escapeHtml, saveText, localTask, msg, saveAs, encodeBase64, jsPretty, sanitize, expose, exposeAll, getMatches, bpVars: true, msgSuccess, msgError, msgWarn, bpFloatContainer, bpWait, dateString */
