// Presentation only: existing renderers, real agent records and confirmation
// gates remain authoritative. No request, text, hidden flag or itinerary changes.
(function installTravelMotion(){
  if(typeof document==='undefined'||!document.body||typeof document.querySelectorAll!=='function')return;
  const body=document.body;
  const sectionSelector='.weekend-picks,.province-atlas,.planning-guide,.weekend-plan,.theme-routes,.atlas-city-detail,.place-card,.folio-day,.folio-proof,.decision-heading,.decision-layout,.study-section';
  const paragraphSelector='.agent-result [data-agent-final] > p,.agent-reasons > li,.candidate-preview > [data-agent-final] > p,.candidate-days > p,.agent-rationale > li,.planning-reason,.advice-day';
  const feedbackAttributes=['data-add','data-atlas-city','data-atlas-region','data-route-tab','data-feature-route','data-hero-photo','data-view','data-filter','data-preset','data-edit-day'];
  const feedbackSelector=feedbackAttributes.map(name=>'['+name+']').join(',')+',#detailadd,#vision-add';
  const seenSections=new WeakSet(),seenParagraphs=new WeakSet(),pendingSections=new Set(),activeParagraphs=new Set(),feedbackNodes=new Set(),scanRoots=new Set();
  let observer=null,observerAvailable=false,frame=null,paragraphTimer=null,feedbackTimer=null,media=null,pageSuspended=false;
  try{media=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')}catch{}
  const reduced=()=>Boolean(media?.matches);
  const animationsAllowed=()=>!pageSuspended&&!document.hidden&&!reduced();
  const connected=node=>Boolean(node&&node.nodeType===1&&node.isConnected!==false);
  function visible(node){
    if(!connected(node))return false;
    if(node.closest?.('[hidden],[aria-hidden="true"],dialog:not([open])'))return false;
    // getClientRects includes offscreen boxes, but excludes CSS-hidden views and
    // closed dialogs. Do not mark those nodes as played before their view opens.
    if(typeof node.getClientRects==='function'&&!node.getClientRects().length)return false;
    return true;
  }
  function matching(root,selector){
    const nodes=[];
    if(root?.matches?.(selector))nodes.push(root);
    if(typeof root?.querySelectorAll==='function')nodes.push(...root.querySelectorAll(selector));
    return nodes;
  }
  function reveal(node){
    node.classList?.remove('travel-reveal-pending');
    node.classList?.add('travel-reveal-visible');
    pendingSections.delete(node);
    try{observer?.unobserve?.(node)}catch{}
  }
  function clearParagraphs(){
    if(paragraphTimer!==null)globalThis.clearTimeout?.(paragraphTimer);paragraphTimer=null;
    for(const node of activeParagraphs){node.classList?.remove('travel-result-paragraph');node.style?.removeProperty?.('--travel-reveal-delay')}
    activeParagraphs.clear();
  }
  function clearFeedback(){
    if(feedbackTimer!==null)globalThis.clearTimeout?.(feedbackTimer);feedbackTimer=null;
    for(const node of feedbackNodes)node.classList?.remove('travel-feedback');
    feedbackNodes.clear();
  }
  function settle(){for(const node of [...pendingSections])reveal(node);clearParagraphs();clearFeedback()}
  try{
    if(typeof IntersectionObserver==='function'){
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries){if(!connected(entry.target)||!animationsAllowed()||entry.isIntersecting||entry.intersectionRatio>0)reveal(entry.target)}
      },{threshold:0.08,rootMargin:'0px 0px 32px 0px'});
      observerAvailable=true;
    }
  }catch{observer=null}
  function scan(root,counts){
    for(const node of matching(root,sectionSelector)){
      if(!visible(node)||seenSections.has(node))continue;
      seenSections.add(node);
      // Without a working observer nothing is hidden. Reduced motion and
      // background rendering likewise stay immediately readable.
      if(!animationsAllowed()||!observerAvailable||node.parentElement?.closest?.('.travel-reveal-pending')){reveal(node);continue}
      node.classList?.add('travel-reveal-pending');pendingSections.add(node);
      try{observer.observe(node)}catch{observerAvailable=false;settle()}
    }
    for(const node of matching(root,paragraphSelector)){
      if(!visible(node)||seenParagraphs.has(node))continue;
      seenParagraphs.add(node);
      if(!animationsAllowed())continue;
      // Only paragraphs actually present in the final DOM are animated. A
      // hidden replay final is skipped until its real hidden attribute clears.
      const group=node.closest?.('.candidate-preview,#advicebody')||root;
      const index=counts.get(group)||0;counts.set(group,index+1);
      node.style?.setProperty?.('--travel-reveal-delay',Math.min(index,6)*70+'ms');
      node.classList?.add('travel-result-paragraph');activeParagraphs.add(node);
    }
    if(activeParagraphs.size&&typeof globalThis.setTimeout==='function'){
      if(paragraphTimer!==null)globalThis.clearTimeout?.(paragraphTimer);
      paragraphTimer=globalThis.setTimeout(clearParagraphs,1400);
    }
  }
  function flush(){
    frame=null;
    // Removed cards cannot retain an observer reference across repeated renders.
    for(const node of [...pendingSections])if(!connected(node))reveal(node);
    for(const node of [...activeParagraphs])if(!connected(node)){node.classList?.remove('travel-result-paragraph');activeParagraphs.delete(node)}
    const roots=[...scanRoots];scanRoots.clear();
    const paragraphCounts=new Map();
    for(const root of roots)if(connected(root))scan(root,paragraphCounts);
  }
  function enqueue(root){
    if(!connected(root))return;
    for(const previous of scanRoots){if(previous===root||previous.contains?.(root))return;if(root.contains?.(previous))scanRoots.delete(previous)}
    scanRoots.add(root);
    if(frame!==null)return;
    if(typeof globalThis.requestAnimationFrame==='function')frame=globalThis.requestAnimationFrame(flush);
    else if(typeof globalThis.setTimeout==='function')frame=globalThis.setTimeout(flush,0);
    else flush();
  }
  function pulse(node){
    if(!connected(node)||!visible(node)||!animationsAllowed())return;
    node.classList?.add('travel-feedback');feedbackNodes.add(node);
    if(typeof globalThis.setTimeout==='function'){
      if(feedbackTimer!==null)globalThis.clearTimeout?.(feedbackTimer);
      feedbackTimer=globalThis.setTimeout(clearFeedback,600);
    }
  }
  function findEquivalent(descriptor){
    if(descriptor.id)return document.getElementById?.(descriptor.id);
    return [...(document.querySelectorAll?.('['+descriptor.attribute+']')||[])].find(node=>node.getAttribute?.(descriptor.attribute)===descriptor.value);
  }
  document.addEventListener?.('click',event=>{
    const clicked=event.target?.closest?.(feedbackSelector);
    if(!clicked||clicked.disabled||!animationsAllowed())return;
    const attribute=feedbackAttributes.find(name=>clicked.hasAttribute?.(name));
    const descriptor=attribute?{attribute,value:clicked.getAttribute(attribute)}:{id:clicked.id};
    const oldCount=document.getElementById?.('headertripcount')?.textContent;
    // The next frame runs after existing synchronous selection/add renderers.
    // Resolve the replacement card by its real data attribute; no handler is
    // intercepted and no class claims that an unsuccessful add succeeded.
    const finish=()=>{
      const current=findEquivalent(descriptor);
      if(attribute==='data-add'){
        if(current&&(current.disabled||current.classList?.contains('added')))pulse(current);
      }else if(descriptor.id==='detailadd'||descriptor.id==='vision-add'){
        if(document.getElementById?.('headertripcount')?.textContent!==oldCount)pulse(document.querySelector?.('.header-trip'));
      }else if(current&&(current.getAttribute?.('aria-pressed')==='true'||current.getAttribute?.('aria-current')==='page'||current.classList?.contains('active')||current.classList?.contains('selected')))pulse(current);
    };
    if(typeof globalThis.requestAnimationFrame==='function')globalThis.requestAnimationFrame(finish);
    else if(typeof globalThis.setTimeout==='function')globalThis.setTimeout(finish,0);
    else finish();
  },true);
  document.addEventListener?.('focusin',event=>{
    // Keyboard users must never focus an opacity-hidden control.
    for(const node of [...pendingSections])if(node.contains?.(event.target))reveal(node);
  });
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden)settle();else enqueue(body)});
  globalThis.addEventListener?.('pagehide',()=>{pageSuspended=true;settle()});
  globalThis.addEventListener?.('pageshow',event=>{
    // Initial pageshow follows normal document load. Preserve offscreen pending
    // sections so their first real intersection can animate; only restoration
    // from a suspended/cached page needs the fail-open visibility reset.
    const restoring=pageSuspended||Boolean(event?.persisted);pageSuspended=false;
    if(restoring)settle();
    enqueue(body);
  });
  const motionChange=()=>{settle();enqueue(body)};
  if(typeof media?.addEventListener==='function')media.addEventListener('change',motionChange);
  else media?.addListener?.(motionChange);
  if(typeof MutationObserver==='function'){
    try{
      const mutations=new MutationObserver(records=>{
        for(const record of records){
          if(record.type==='attributes'){enqueue(record.target);continue}
          // Only added subtrees are scanned. Class/style mutations made by this
          // module are excluded by attributeFilter, avoiding observer loops.
          for(const node of record.addedNodes||[])if(node.nodeType===1)enqueue(node);
          if(record.removedNodes?.length)enqueue(record.target);
        }
      });
      mutations.observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','aria-hidden','data-view']});
    }catch{}
  }
  enqueue(body);
})();
