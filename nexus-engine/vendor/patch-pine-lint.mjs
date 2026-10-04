// Nexus patches on top of the bundled pine-tools linter (brain-app/api/_nexus/pine-lint.mjs).
// Each patch closes a gap found by comparing the checker with TradingView's own compiler.
// The script is idempotent: run `node nexus-engine/vendor/patch-pine-lint.mjs` after re-bundling pine-tools.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../brain-app/api/_nexus/pine-lint.mjs");
let src = fs.readFileSync(file, "utf8");
const MARK = "/* nexus-patched:";
const already = src.includes(MARK);


// Injected helper (uses the bundle's internal names: pe = statement walker, Ye = expressions of a statement,
// A = expression walker, R = callee name, E = built-in function table).
// TradingView gives a typed parameter without a qualifier (`int len`) the "simple" qualifier when the body needs it
// and "series" otherwise; untyped parameters inherit the qualifier of each argument. The linter has no such
// inference, so the parameter annotations are completed here before validation. For each such parameter, with
// "its values" = the parameter plus the locals computed from it:
//  1. its values reach an argument in a simple/input/const position      -> "simple <type>"
//  2. its values reach an argument of a call the checker cannot resolve    -> left alone (no finding either way)
//  3. otherwise                                                            -> "series <type>"
// (Verified against TradingView's compiler with the q_* probes in the calibration notes.)
const QUALIFY_PARAMS = `function __nxSimpleParams(ast){
  const nonSeries=/^(simple|input|const)\\s+/,simplePrim=/^simple\\s+(int\\/float|int|float|bool|string|color)$/,plain=/^(int|float|bool|string|color)$/;
  const fns=[];
  pe(ast.body,st=>{(st.type==="FunctionDeclaration"||st.type==="MethodDeclaration")&&Array.isArray(st.params)&&Array.isArray(st.body)&&fns.push(st)});
  if(!fns.length)return;
  const count=new Map;for(const f of fns)count.set(f.name,(count.get(f.name)||0)+1);
  const annOf=p=>p&&p.typeAnnotation?String(p.typeAnnotation.name||"").trim():"";
  const refsAny=(expr,names)=>{let hit=!1;A(expr,nd=>{nd.type==="Identifier"&&names.has(nd.name)&&(hit=!0)});return hit};
  // The parameter plus every local whose value is computed from it.
  const valuesOf=(f,name)=>{const t=new Set([name]);for(let grew=!0,i=0;grew&&i<20;i++){grew=!1;pe(f.body,st=>{
      if(st.type==="VariableDeclaration"&&st.init&&!t.has(st.name)&&refsAny(st.init,t))t.add(st.name),grew=!0;
      else if(st.type==="AssignmentStatement"&&st.target&&st.target.type==="Identifier"&&!t.has(st.target.name)&&refsAny(st.value,t))t.add(st.target.name),grew=!0;
      else if(st.type==="TupleDeclaration"&&st.init&&Array.isArray(st.names)&&st.names.some(n=>!t.has(n))&&refsAny(st.init,t)){for(const n of st.names)t.add(n);grew=!0}
    })}return t};
  // Arguments of every call in the body: strict = sits in a non-series position, open = callee unknown to the checker.
  const scan=f=>{const strict=[],open=[];
    pe(f.body,st=>{for(const ex of Ye(st))A(ex,nd=>{
      if(nd.type!=="CallExpression")return;
      const callee=R(nd.callee),def=callee?E.get(callee):void 0;let pos=-1;
      for(const arg of nd.arguments){
        if(!arg.name)pos++;
        if(!arg.value)continue;
        if(def){
          const sigs=def.overloads&&def.overloads.length?def.overloads:[def];let seen=!1,all=!0;
          for(const sg of sigs){const prm=arg.name?sg.parameters.find(q=>q.name===arg.name):sg.parameters[pos];if(!prm)continue;seen=!0;nonSeries.test(String(prm.type||"").trim())||(all=!1)}
          seen&&all&&strict.push(arg.value);
        }else if(callee&&count.get(callee)===1){
          const tf=fns.find(g=>g.name===callee),idx=arg.name?tf.params.findIndex(q=>q.name===arg.name):pos,a=annOf(tf.params[idx]);
          simplePrim.test(a)?strict.push(arg.value):plain.test(a)&&open.push(arg.value);
        }else open.push(arg.value);
      }
    })});
    return{strict,open}};
  for(let round=0;round<4;round++){let changed=!1;
    for(const f of fns){const{strict}=scan(f);if(!strict.length)continue;
      for(const p of f.params){const a=annOf(p);if(!plain.test(a))continue;const vals=valuesOf(f,p.name);
        strict.some(x=>refsAny(x,vals))&&(p.typeAnnotation.name="simple "+a,changed=!0)}}
    if(!changed)break}
  for(const f of fns){const{open}=scan(f);
    for(const p of f.params){const a=annOf(p);if(!plain.test(a))continue;const vals=valuesOf(f,p.name);
      open.some(x=>refsAny(x,vals))||(p.typeAnnotation.name="series "+a)}}
}`;

// Injected helpers for method checks on drawing objects. __nxDrawTypes maps a variable name to its drawing type when
// every declaration of that name in the script is a direct constructor call of one type (`x = label.new(...)`).
const DRAW_RECEIVER = `var __nxDrawTypes=new Map;function __nxCollectDrawTypes(ast){__nxDrawTypes=new Map;const bad=new Set;
  pe(ast.body,st=>{if(st.type!=="VariableDeclaration")return;
    let ty="";const ann=st.typeAnnotation?String(st.typeAnnotation.name||"").trim():"";
    if(/^(line|label|box|table|linefill|polyline)$/.test(ann))ty=ann;
    else if(!ann&&st.init&&st.init.type==="CallExpression"){const m=/^(line|label|box|table|linefill|polyline)\\.(new|copy)$/.exec(R(st.init.callee)||"");m&&(ty=m[1])}
    if(!ty||__nxDrawTypes.has(st.name)&&__nxDrawTypes.get(st.name)!==ty)bad.add(st.name);else __nxDrawTypes.set(st.name,ty)});
  for(const k of bad)__nxDrawTypes.delete(k)}
function __nxDrawRecv(n,r){const isDraw=/^(line|label|box|table|linefill|polyline)$/,parts=r.split(".");
  if(parts.length<2||parts.length>3)return"";
  const p=n.symbolTable.lookup(parts[0]);if(!p||p.line===0)return"";
  let y=g.baseTypeName(String(p.type||""));
  if(parts.length===2){y==="unknown"&&(y=__nxDrawTypes.get(parts[0])||"");return isDraw.test(y)?y:""}
  const f=n.udtFieldTypes.get(y),ft=f&&f.get(parts[1])?g.baseTypeName(String(f.get(parts[1]))):"";return isDraw.test(ft)?ft:""}
`;

// Injected helper: the text argument of drawing calls must be a string. Positions are for the namespace form
// (`label.set_text(id, text)`); the method form (`lbl.set_text(text)`) shifts them by one.
const TEXT_ARG = `function __nxTextArg(n,e,r,t){
  const TEXT={"label.new":2,"label.set_text":1,"table.cell":3,"table.cell_set_text":3,"box.set_text":1};
  let fn=r,shift=0;
  if(!(fn in TEXT)){const k=__nxDrawRecv(n,r);if(!k)return;fn=k+"."+r.slice(r.lastIndexOf(".")+1);shift=1;if(!(fn in TEXT))return}
  const idx=TEXT[fn]-shift;let pos=-1,arg=null,first=null;
  for(const a of e.arguments){if(a.name){a.name==="text"&&(arg=a)}else{pos++;pos===0&&(first=a);pos===idx&&!arg&&(arg=a)}}
  if(!arg||!arg.value)return;
  const base=x=>g.baseTypeName(String(n.inferExpressionType(x,t)));
  if(fn==="label.new"&&!arg.name&&first){const ft=base(first.value);if(ft!=="int"&&ft!=="float")return}
  const ty=base(arg.value);
  if(ty!=="int"&&ty!=="float"&&ty!=="bool")return;
  const d=n.describeArgForTemplate(arg.value,n.inferExpressionType(arg.value,t),t);
  n.addTemplateError({line:arg.value.line,column:arg.value.column,length:0,message:I,severity:0,code:"CE10123",ctx:{argDisplayName:"text",argUserFriendlyRepresentation:d.repr,argumentType:d.typeStr,currentTypeDocStr:"series string",funId:fn,typePostfix:""}})
}
`;

const patches = [
  {
    id: "simple-int-float",
    why: 'Parameters documented as "simple int/float" (ta.bb mult, ta.kc mult, ta.sar ...) reject series values on TradingView.',
    find: 'function mt(n){return/^simple\\s+(int|float|bool|string|color)$/.test((n??"").trim())}',
    replace: 'function mt(n){return/^simple\\s+(int\\/float|int|float|bool|string|color)$/.test((n??"").trim())}',
  },
  {
    id: "typed-series-vars",
    why: "`int len = <series expression>` is a series value even though the declared type has no qualifier; values read from arrays, matrices, maps and object fields are always series. (Only the symbol table is consulted: inferring sub-expression types here would report unrelated findings.)",
    find: 'function Wr(n,e){if(e.type!=="Identifier")return!1;let t=n.symbolTable.lookup(e.name);return t?n.promotedQualifierFor(t)==="series":!1}',
    replace: 'function __nxSymType(n,e){if(!e||e.type!=="Identifier")return"";let t=n.symbolTable.lookup(e.name);return t&&t.line!==0&&t.kind==="variable"?String(t.type||"").replace(/^series<(.*)>$/,"$1"):""}function Wr(n,e){if(e.type==="CallExpression"){let c=R(e.callee);if(/^(array|matrix|map)\\.\\w+$/.test(c))return!0;return e.callee.type==="MemberExpression"?/^(array|matrix|map)</.test(__nxSymType(n,e.callee.object)):!1}if(e.type==="MemberExpression"){let o=__nxSymType(n,e.object);return o!==""&&n.udtFieldTypes.has(g.baseTypeName(o))}if(e.type!=="Identifier")return!1;let t=n.symbolTable.lookup(e.name);return t?n.promotedQualifierFor(t)==="series"||n.declaredQualifiers.get(t)==="series":!1}',
  },
  {
    id: "udf-simple-callsite",
    why: "A series variable declared with a type keyword must also be rejected when it is passed to a `simple` parameter of a user function.",
    find: "if(mt(p)&&me(y)&&g.isAssignable(y,c)){",
    replace: "if(mt(p)&&(me(y)||Wr(n,b))&&g.isAssignable(y,c)){",
  },
  {
    id: "udf-inferred-simple-params",
    why: "TradingView infers `simple` for a typed function parameter that the body passes to a simple-only built-in parameter (`f(float src, int len) => ta.ema(src, len)`), and then rejects series arguments at the call site.",
    find: 't.version=o;let p=new Ge(',
    replace: 't.version=o;try{__nxSimpleParams(s)}catch{}try{__nxCollectDrawTypes(s)}catch{}let p=new Ge(',
  },
  {
    id: "udf-inferred-simple-params-fn",
    why: "Helper for the patch above.",
    find: "function Fa(n,e={}){",
    replace: QUALIFY_PARAMS + "function Fa(n,e={}){",
  },
  {
    id: "typed-series-decl",
    why: "A declaration such as `float x = close` or `int n = ta.barssince(c)` has a series value: keep the qualifier of the initial value instead of the bare declared type (both declaration passes).",
    find: 'if(e.typeAnnotation)r.type=oe(this,e.typeAnnotation.name);else if(e.init){let s=this.inferExpressionType(e.init,t);r.type=g.isNaType(s)?"unknown":s}this.symbolTable.define(r)}',
    replace: 'if(e.typeAnnotation)r.type=oe(this,e.typeAnnotation.name),__nxSeriesType(this,e,r,t);else if(e.init){let s=this.inferExpressionType(e.init,t);r.type=g.isNaType(s)?"unknown":s}this.symbolTable.define(r)}',
  },
  {
    id: "typed-series-decl-2",
    why: "Second site of the patch above (statement validation).",
    find: 'if(e.typeAnnotation)s.type=oe(this,e.typeAnnotation.name);else if(e.init){let i=this.inferExpressionType(e.init,t);s.type=g.isNaType(i)?"unknown":i}if(this.symbolTable.define(s),',
    replace: 'if(e.typeAnnotation)s.type=oe(this,e.typeAnnotation.name),__nxSeriesType(this,e,s,t);else if(e.init){let i=this.inferExpressionType(e.init,t);s.type=g.isNaType(i)?"unknown":i}if(this.symbolTable.define(s),',
  },
  {
    id: "typed-series-decl-fn",
    why: "Helper for the two patches above.",
    find: "function oe(n,e){",
    replace: 'function __nxSeriesType(n,e,t,r){try{if(!e.init||K(String(e.typeAnnotation.name))||!/^(int|float|bool|string|color)$/.test(String(t.type)))return;me(String(n.inferExpressionType(e.init,r)))&&(t.type="series<"+t.type+">")}catch{}}function oe(n,e){',
  },
  {
    id: "lexer-plain-identifiers",
    why: "`case` and `default` are ordinary identifiers on TradingView (the manual itself uses `string default = ...`).",
    find: '"switch","case","default","var","varip","const","na","export"',
    replace: '"switch","var","varip","const","na","export"',
  },
  {
    id: "series-arg-wording",
    why: "The finding above is only raised for series values: say so even when the argument is an object field or a typed variable.",
    find: '!g.isAssignable(h.type,f.type))continue;let x=n.describeArgForTemplate(h.arg.value,h.type,s);n.addTemplateError({line:h.arg.value.line,column:h.arg.value.column,length:0,message:I,severity:0,code:"CE10123",ctx:{argDisplayName:f.name,argUserFriendlyRepresentation:x.repr,argumentType:x.typeStr,',
    replace: '!g.isAssignable(h.type,f.type))continue;let x=n.describeArgForTemplate(h.arg.value,h.type,s);n.addTemplateError({line:h.arg.value.line,column:h.arg.value.column,length:0,message:I,severity:0,code:"CE10123",ctx:{argDisplayName:f.name,argUserFriendlyRepresentation:x.repr.replace(/\\((?:unknown|series <type>)\\)/,"(series "+g.baseTypeName(String(f.type))+")"),argumentType:/unknown|<type>/.test(x.typeStr)?"series "+g.baseTypeName(String(f.type)):x.typeStr.replace(/^(const|literal|input|simple)\\b/,"series"),',
  },
  {
    id: "reserved-names",
    why: 'TradingView rejects these as variable, function, parameter and field names (CE10150): "range" and "text" are easy to pick by accident.',
    find: 'tt=new Set(["and","as","break","by","continue","do","else","export","false","for","if","import","in","not","or","return","switch","to","true","var","varip","while"])',
    replace: 'tt=new Set(["and","as","break","by","continue","do","else","export","false","for","if","import","in","not","or","return","switch","to","true","var","varip","while","range","text","struct","class","try","catch","throw","is","ellipse","polygon"])',
  },
  {
    id: "input-only-params",
    why: 'Parameters documented as "input ..." on functions without overloads (plot linewidth/style/display, plotshape style/location, hline price/color, alert freq ...) reject series values on TradingView.',
    find: 'if(d)for(let y=0;y<r.parameters.length;y++){let f=r.parameters[y],h=(f.rawType??"").trim(),x=h.match(/^simple\\s+([A-Za-z_][A-Za-z0-9_.]*)$/);if(!x||O.has(x[1]))continue;',
    replace: 'if(d)for(let y=0;y<r.parameters.length;y++){let f=r.parameters[y],h=__nxInputOnly(t,f.name);if(!h)continue;let T=a.get(f.name)??o[y];if(!T)continue;let N=T.arg.value;if(!(me(T.type)||Wr(n,N)||$r(n,N,s)==="series"))continue;let x=h.replace(/^input\\s+/,""),D=N.type==="TernaryExpression"?"operator ?:":N.type==="BinaryExpression"||N.type==="UnaryExpression"?`operator ${N.operator}`:n.describeArgForTemplate(N,`series ${x}`,s).repr;n.addTemplateError({line:N.line,column:N.column,length:0,message:I,severity:0,code:"CE10123",ctx:{argDisplayName:f.name,argUserFriendlyRepresentation:D,argumentType:`series ${x}`,currentTypeDocStr:h,funId:t,typePostfix:""}})}if(d)for(let y=0;y<r.parameters.length;y++){let f=r.parameters[y],h=(f.rawType??"").trim(),x=h.match(/^simple\\s+([A-Za-z_][A-Za-z0-9_.]*)$/);if(!x||O.has(x[1]))continue;',
  },
  {
    id: "input-only-params-fn",
    why: "Helper for the patch above.",
    find: "function ie(n){",
    replace: 'function __nxInputOnly(n,e){let t=E.get(n);if(!t||t.overloads&&t.overloads.length>1)return null;let r=null;for(let s of ie(t)){let i=s.parameters.find(a=>a.name===e);if(!i)continue;let a=String(i.type||"").trim();if(!/^input\\s+/.test(a))return null;r=r||a}return r}function ie(n){',
  },
  {
    id: "object-methods",
    why: "A method that does not exist on a line / label / box / table / linefill / polyline (`lbl.set_bgcolor()`, `bx.set_color()`, `zone.bx.set_color()`) is a compile error on TradingView; only primitives and collections were checked, and untyped drawing variables have no type in the checker.",
    find: "(b||h)&&!Br(n,l)&&n.addError(e.line,e.column+a.length,r.length,`Could not find method or method reference '${r}'`,0);",
    replace: "(b||h)&&!Br(n,l)&&n.addError(e.line,e.column+a.length,r.length,`Could not find method or method reference '${r}'`,0);if(n.parserClean&&!(b||h)){let k=__nxDrawRecv(n,r);k&&!pr(k,l)&&!n.declaredFunctionNames.has(l)&&!n.methodDeclaredNames.has(l)&&!Br(n,l)&&n.addError(e.line,e.column,r.length,`Could not find method or method reference '${r}'`,0)}",
  },
  {
    id: "object-fields",
    why: "Collections and drawing objects have no fields (`arr.length`, `lbl.x`): TradingView reports \"Object has no field\".",
    find: 'let a=g.baseTypeName(n.inferExpressionType(s,t));(a==="int"||a==="float"||a==="bool"||a==="string"||a==="color")&&Lr(n,e)}',
    replace: 'let a=g.baseTypeName(n.inferExpressionType(s,t));(a==="int"||a==="float"||a==="bool"||a==="string"||a==="color"||/^(array|matrix|map)</.test(a)||/^(line|label|box|table|linefill|polyline)$/.test(a))&&Lr(n,e)}',
  },
  {
    id: "object-methods-fn",
    why: "Helpers for the patch above: the drawing type of a method receiver (`name` or `object.field`).",
    find: "function Br(n,e){",
    replace: DRAW_RECEIVER + "function Br(n,e){",
  },
  {
    id: "duplicate-argument",
    why: 'Passing a parameter both by position and by name (`input.int(1, "N", title = "N")`) is CE10072 on TradingView. Reported only when the name is covered by a positional argument in every overload.',
    find: "let l=r.parameters.length,p=ur(t);if(!p&&o.length>l){",
    replace: "let l=r.parameters.length,p=ur(t);if(s===\"6\"&&!p&&a.size>0&&o.length>0){let y=be(t)?ot(t):[r];for(let[f,h]of a)y.length>0&&y.every(x=>{let T=x.parameters.findIndex(N=>N.name===f);return T>=0&&T<o.length})&&n.addTemplateError({line:h.arg.value.line,column:h.arg.value.column,length:0,message:'Two or more arguments are passed to the \"{name}\" parameter. You can pass only one argument.',severity:0,code:\"CE10072\",ctx:{name:f}})}if(!p&&o.length>l){",
  },
  {
    id: "text-argument-type",
    why: 'A number passed as the text of a label / table cell / box (`label.new(bar_index, high, close)`, `lbl.set_text(close)`, `tbl.cell(0, 0, bar_index)`) is CE10123 on TradingView; overloads and method calls hid it from the checker.',
    find: 'for(let a of e.arguments)a.skipSemanticValidation||n.validateExpression(a.value,t);if(t==="6"&&r.startsWith("request.")&&Fn(n,e,r),!r)return;',
    replace: 'for(let a of e.arguments)a.skipSemanticValidation||n.validateExpression(a.value,t);if(t==="6"&&r)try{__nxTextArg(n,e,r,t)}catch{}if(t==="6"&&r.startsWith("request.")&&Fn(n,e,r),!r)return;',
  },
  {
    id: "text-argument-type-fn",
    why: "Helper for the patch above.",
    find: "function Ur(n,e,t=\"6\"){",
    replace: TEXT_ARG + "function Ur(n,e,t=\"6\"){",
  },
];

if (already) {
  console.log("pine-lint.mjs is already patched; nothing to do.");
} else {
  for (const p of patches) {
    const n = src.split(p.find).length - 1;
    if (n !== 1) throw new Error(`patch ${p.id}: expected exactly one match, found ${n}`);
    src = src.replace(p.find, () => p.replace);
  }
  const header = src.indexOf("*/");
  src = src.slice(0, header + 2) + `\n${MARK} ${patches.map((p) => p.id).join(", ")} - see nexus-engine/vendor/patch-pine-lint.mjs */` + src.slice(header + 2);
  fs.writeFileSync(file, src);
  console.log(`patched ${patches.length} places in pine-lint.mjs`);
}
