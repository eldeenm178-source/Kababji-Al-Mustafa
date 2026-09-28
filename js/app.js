const MENU_STORAGE_KEYS=window.RESTAURANT_MENU.storageKeys;
function loadSharedArray(key,fallback){
  try{
    const stored=localStorage.getItem(key);
    if(stored===null){
      const initial=JSON.parse(JSON.stringify(fallback));
      localStorage.setItem(key,JSON.stringify(initial));
      return initial;
    }
    const parsed=JSON.parse(stored);
    return Array.isArray(parsed)?parsed:JSON.parse(JSON.stringify(fallback));
  }catch{
    return JSON.parse(JSON.stringify(fallback));
  }
}
function loadSharedObject(key,fallback){
  try{
    const stored=localStorage.getItem(key);
    if(stored===null){
      const initial=JSON.parse(JSON.stringify(fallback));
      localStorage.setItem(key,JSON.stringify(initial));
      return initial;
    }
    const parsed=JSON.parse(stored);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:JSON.parse(JSON.stringify(fallback));
  }catch{
    return JSON.parse(JSON.stringify(fallback));
  }
}
const products=loadSharedArray(MENU_STORAGE_KEYS.products,window.RESTAURANT_MENU.products);
const previousCategoryImages={
  "الشوربة":"images/hero-food.jpg","المقبلات":"images/tray-photo.jpg","المشويات":"images/kebab-photo.jpg",
  "الجريل":"images/hero-food.jpg","السلطات":"images/kofta-photo.jpg","الطواجن":"images/tray-photo.jpg",
  "الأطباق الرئيسية":"images/chicken-photo.jpg","الصواني":"images/tray-photo.jpg",
  "الوجبات الاقتصادية":"images/chicken-photo.jpg","السندوتشات":"images/hero-food.jpg"
};
let productImagesMigrated=false;
for(const product of products){
  if(product.img!==previousCategoryImages[product.cat]) continue;
  let relevantImage="";
  if(product.cat==="المشويات"){
    if(/فرخة|شيش|صدور/.test(product.name))relevantImage="images/chicken-photo.jpg";
    else if(/كفتة/.test(product.name))relevantImage="images/kofta-photo.jpg";
    else relevantImage="images/kebab-photo.jpg";
  }else if(product.cat==="الجريل"){
    relevantImage="images/hero-food.jpg";
  }
  if(product.img!==relevantImage){product.img=relevantImage;productImagesMigrated=true}
}
if(productImagesMigrated)localStorage.setItem(MENU_STORAGE_KEYS.products,JSON.stringify(products));
const categories=window.RESTAURANT_MENU.categories;
const featuredOfferIds=products.filter(product=>product.featured).map(product=>product.id);
const couponCodes=loadSharedObject(MENU_STORAGE_KEYS.coupons,window.RESTAURANT_MENU.coupons);
const DELIVERY_FEE = 30;
const POINT_ACCOUNTS_KEY = "kababgyPointAccounts";

function readPointAccounts(){
  try{
    const accounts=JSON.parse(localStorage.getItem(POINT_ACCOUNTS_KEY)||"{}");
    return accounts&&typeof accounts==="object"?accounts:{};
  }catch{
    return {};
  }
}

let currentCategory = "الكل";
let currentSearch = "";
let cart = JSON.parse(localStorage.getItem("kababgyCart") || "[]");
let pointAccounts=readPointAccounts();
let activePhone="";
let pointsBalance=0;
let phoneLookupTimer;
let activeCoupon = null;
let couponFeedback = "أدخل كود الخصم لتطبيقه على الطلب.";
let pointsToUse = 0;

const categoriesEl = document.getElementById("categories");
const productsEl = document.getElementById("products");
const offersEl = document.getElementById("offersGrid");
const offersMotionToggle = document.getElementById("offersMotionToggle");
const nextOfferButton = document.getElementById("nextOffer");
const cartCount = document.getElementById("cartCount");
const offersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let offersTimer = null;
let offersVisible = false;
let offersPaused = offersReducedMotion.matches;
let offersManualMotion = false;
let offerIndex = 0;

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

function renderCategories(){
  categoriesEl.innerHTML = "";
  categories.forEach(([name,icon])=>{
    const btn=document.createElement("button");
    btn.className="category"+(currentCategory===name?" active":"");
    btn.innerHTML=`<span class="icon">${icon}</span><span>${name}</span>`;
    btn.onclick=()=>filterCategory(name);
    categoriesEl.appendChild(btn);
  });
}

function productImageMarkup(product,className="product-image"){
  if(product.img)return `<img class="${className}" src="${escapeHtml(product.img)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.outerHTML='<div class=\'${className}-placeholder\' aria-hidden=\'true\'>🍽️</div>'">`;
  return `<div class="${className}-placeholder" aria-hidden="true">🍽️</div>`;
}

function renderProducts(){
  const list=products.filter(p=>
    (currentCategory==="الكل"||p.cat===currentCategory) &&
    (!currentSearch||p.name.includes(currentSearch)||p.desc.includes(currentSearch))
  );
  if(!list.length){
    productsEl.innerHTML=`<div class="empty">مفيش أصناف مضافة في قسم ${currentCategory} حاليًا.</div>`;
    return;
  }
  productsEl.innerHTML=list.map(p=>`
    <article class="product">
      ${productImageMarkup(p)}
      <div class="product-info">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.desc)}</p>
        ${p.options?`<label class="option-label" for="productOption-${p.id}">اختر الوزن أو السعر</label><select class="product-option" id="productOption-${p.id}">${p.options.map((option,index)=>`<option value="${index}">${escapeHtml(option.label)} - ${Number(option.price)} ج.م</option>`).join("")}</select>`:""}
        <div class="product-price">${p.options?`يبدأ من ${Math.min(...p.options.map(option=>option.price))}`:p.price} ج.م</div>
        <button class="add-btn" onclick="addToCart(${p.id}, document.getElementById('productOption-${p.id}')?.value)">أضف للسلة 🛒</button>
      </div>
    </article>
  `).join("");
}

function renderOffers(){
  const featuredProducts=featuredOfferIds.map(id=>products.find(p=>p.id===id)).filter(Boolean);
  if(!featuredProducts.length){
    offersEl.innerHTML='<div class="empty">لا توجد عروض مميزة حاليًا.</div>';
    return;
  }
  offersEl.innerHTML=featuredProducts.map(p=>{
    const regularPrice=p.options?.[0]?.price??p.price;
    const offer=p.offer?.enabled&&Number(p.offer.value)>0?p.offer:null;
    const discount=offer?Math.min(regularPrice,offer.type==="percent"?Math.round(regularPrice*offer.value/100):Number(offer.value)):0;
    const finalPrice=regularPrice-discount;
    const offerLabel=offer?offer.type==="percent"?`خصم ${offer.value}%`:`خصم ${offer.value} ج.م`:"اختيار المطعم";
    return `
      <article class="offer-card">
        ${productImageMarkup(p,"offer-image")}
        <div class="offer-copy">
          <span class="offer-tag">${escapeHtml(offerLabel)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.desc)}</p>
          <div class="offer-action">
            <span class="offer-price">${discount?`<del>${regularPrice} ج.م</del><strong>${finalPrice} ج.م</strong>`:`${regularPrice} ج.م`}</span>
            <button onclick="addToCart(${p.id}, 0, true)">أضف للسلة</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function stopOffersMotion(){
  window.clearInterval(offersTimer);
  offersTimer=null;
}

function updateOffersMotionToggle(){
  const label=offersPaused?"تشغيل حركة العروض":"إيقاف حركة العروض";
  offersMotionToggle.setAttribute("aria-label",label);
  offersMotionToggle.setAttribute("title",label);
  offersMotionToggle.setAttribute("aria-pressed",String(offersPaused));
  offersMotionToggle.textContent=offersPaused?"▶":"Ⅱ";
}

function advanceOffer(){
  if(offersEl.children.length<2) return;
  offerIndex=(offerIndex+1)%offersEl.children.length;
  const card=offersEl.children[offerIndex];
  const delta=card.getBoundingClientRect().right-offersEl.getBoundingClientRect().right;
  offersEl.scrollBy({left:delta,behavior:offersReducedMotion.matches&&!offersManualMotion?"auto":"smooth"});
}

function startOffersMotion(){
  stopOffersMotion();
  if(offersPaused||!offersVisible||(offersReducedMotion.matches&&!offersManualMotion)||offersEl.children.length<2) return;
  offersTimer=window.setInterval(advanceOffer,3000);
}

new IntersectionObserver(entries=>{
  offersVisible=entries[0].isIntersecting;
  if(offersVisible) startOffersMotion();
  else stopOffersMotion();
},{threshold:.2}).observe(document.getElementById("offers"));

offersEl.addEventListener("pointerenter",event=>{
  if(event.pointerType==="mouse") stopOffersMotion();
});
offersEl.addEventListener("pointerleave",event=>{
  if(event.pointerType==="mouse") startOffersMotion();
});
offersEl.addEventListener("focusin",stopOffersMotion);
offersEl.addEventListener("focusout",event=>{
  if(!offersEl.contains(event.relatedTarget)) startOffersMotion();
});
offersEl.addEventListener("touchstart",stopOffersMotion,{passive:true});
offersEl.addEventListener("touchend",()=>window.setTimeout(startOffersMotion,800),{passive:true});
offersEl.addEventListener("touchcancel",()=>window.setTimeout(startOffersMotion,800),{passive:true});
offersReducedMotion.addEventListener("change",()=>{
  if(offersReducedMotion.matches&&!offersManualMotion){
    offersPaused=true;
    updateOffersMotionToggle();
    stopOffersMotion();
  }else startOffersMotion();
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden) stopOffersMotion();
  else startOffersMotion();
});
updateOffersMotionToggle();
nextOfferButton.onclick=()=>{
  advanceOffer();
  startOffersMotion();
};
offersMotionToggle.onclick=()=>{
  offersPaused=!offersPaused;
  if(!offersPaused) offersManualMotion=true;
  updateOffersMotionToggle();
  if(offersPaused) stopOffersMotion();
  else startOffersMotion();
};

function filterCategory(cat){
  currentCategory=cat;
  currentSearch="";
  renderCategories();
  renderProducts();
  document.getElementById("popular").scrollIntoView({behavior:"smooth",block:"start"});
}

function addToCart(id,optionIndex,isOffer=false){
  const p=products.find(x=>x.id===id);
  const selectedOption=p.options?.[Number(optionIndex)||0];
  const listPrice=selectedOption?.price??p.price;
  const offer=p.offer?.enabled&&Number(p.offer.value)>0?p.offer:null;
  const discount=isOffer&&offer?Math.min(listPrice,offer.type==="percent"?Math.round(listPrice*offer.value/100):Number(offer.value)):0;
  const price=listPrice-discount;
  const offerDescription=discount?offer.type==="percent"?`خصم ${offer.value}%`:`خصم ${offer.value} ج.م`:"";
  const optionLabel=[selectedOption?.label,offerDescription].filter(Boolean).join("، ");
  const key=`${id}:${selectedOption?Number(optionIndex):"default"}${discount?":offer":""}`;
  const existing=cart.find(x=>(x.key||`${x.id}:default`)===key);
  if(existing) existing.qty++;
  else cart.push({key,id:p.id,name:p.name,optionLabel,price,listPrice,qty:1});
  saveCart();
  showCartToast(`اتضاف ${p.name}${optionLabel?` (${optionLabel})`:""} للسلة`);
}

let cartToastTimer;
function showCartToast(message){
  const toast=document.getElementById("cartToast");
  toast.textContent=message;
  toast.classList.add("show");
  window.clearTimeout(cartToastTimer);
  cartToastTimer=window.setTimeout(()=>toast.classList.remove("show"),2000);
}

function removeFromCart(id){
  cart=cart.filter(x=>(x.key||`${x.id}:default`)!==String(id));
  saveCart();
  renderCart();
}

function saveCart(){
  localStorage.setItem("kababgyCart",JSON.stringify(cart));
  cartCount.textContent=cart.reduce((s,x)=>s+x.qty,0);
}

function renderCart(){
  const box=document.getElementById("cartItems");
  if(!cart.length){
    box.innerHTML='<div class="empty">السلة فاضية.. اختار اللي نفسك فيه 🔥</div>';
  }else{
    box.innerHTML=cart.map(x=>`
      <div class="cart-row">
        <div><strong>${escapeHtml(x.name)}${x.optionLabel?` - ${escapeHtml(x.optionLabel)}`:""}</strong><br><small>${x.qty} × ${Number(x.price)} ج.م</small></div>
        <button class="remove" onclick="removeFromCart('${x.key||`${x.id}:default`}')">×</button>
      </div>`).join("");
  }
  const totals=getCartTotals();
  document.getElementById("cartSubtotal").textContent=`${totals.subtotal} ج.م`;
  document.getElementById("couponDiscount").textContent=`-${totals.couponDiscount} ج.م`;
  document.getElementById("pointsDiscount").textContent=`-${totals.pointsDiscount} ج.م`;
  document.getElementById("pointsEarned").textContent=`${totals.pointsEarned} نقطة`;
  document.getElementById("cartTotal").textContent=`${totals.total} ج.م`;
  document.getElementById("pointsBalanceText").textContent=`رصيدك: ${pointsBalance} نقطة (${pointsBalance*2} ج.م)`;
  document.getElementById("pointsInput").max=totals.maxRedeemablePoints;
  document.getElementById("pointsInput").value=totals.pointsUsed;
  document.getElementById("pointsInput").disabled=!activePhone;
  document.getElementById("useMaxPoints").disabled=!activePhone||!totals.maxRedeemablePoints;
  document.getElementById("couponCodesHint").textContent=`الأكواد المتاحة: ${Object.entries(couponCodes).filter(([,coupon])=>coupon.enabled!==false).map(([code])=>code).join("، ")||"لا توجد أكواد فعالة حاليًا"}`;
  if(!activePhone) document.getElementById("pointsBalanceText").textContent="اكتب رقم الهاتف وتحقق من رصيدك لاستخدام النقاط.";
  document.getElementById("couponMessage").textContent=couponFeedback;
}

function getCartTotals(){
  const subtotal=cart.reduce((sum,item)=>sum+item.price*item.qty,0);
  const couponDiscount=activeCoupon
    ? Math.min(subtotal,activeCoupon.type==="percent"?Math.round(subtotal*activeCoupon.value/100):activeCoupon.value)
    : 0;
  const afterCoupon=Math.max(0,subtotal-couponDiscount);
  const maxRedeemablePoints=Math.min(pointsBalance,Math.floor(afterCoupon/2));
  const pointsUsed=Math.min(maxRedeemablePoints,Math.max(0,Math.floor(pointsToUse)));
  pointsToUse=pointsUsed;
  const pointsDiscount=pointsUsed*2;
  const total=afterCoupon-pointsDiscount;
  return {subtotal,couponDiscount,pointsUsed,pointsDiscount,total,pointsEarned:Math.floor(total/100)*3,maxRedeemablePoints};
}

function openCart(){
  renderCart();
  document.getElementById("cartModal").classList.add("show");
}
function closeCart(){document.getElementById("cartModal").classList.remove("show")}

function normalizePhone(value){
  let phone=value.replace(/\D/g,"");
  if(phone.startsWith("00")) phone=phone.slice(2);
  if(phone.length===11&&phone.startsWith("0")) phone=`20${phone.slice(1)}`;
  return phone;
}

function isCompletePhone(phone){
  return /^201[0125]\d{8}$/.test(phone);
}

function savePointAccounts(){
  localStorage.setItem(POINT_ACCOUNTS_KEY,JSON.stringify(pointAccounts));
}

function loadPointsForPhone(){
  const phone=normalizePhone(document.getElementById("customerPhone").value);
  const message=document.getElementById("customerMessage");
  if(!isCompletePhone(phone)){
    message.textContent="اكتب رقم موبايل مصري صحيحًا من ١١ رقمًا.";
    return false;
  }
  activePhone=phone;
  document.getElementById("customerPhone").value=phone;
  const account=pointAccounts[phone]||{name:"",points:0};
  const accountPoints=Number(account.points)||0;
  pointsBalance=Math.max(0,Math.floor(accountPoints));
  pointsToUse=0;
  if(!document.getElementById("customerName").value.trim()&&account.name){
    document.getElementById("customerName").value=account.name;
  }
  localStorage.setItem("kababgyActivePhone",phone);
  message.textContent=`تم تحميل رصيد ${pointsBalance} نقطة لهذا الرقم.`;
  renderCart();
  return true;
}

function updateOrderType(){
  const type=document.querySelector('input[name="orderType"]:checked').value;
  const delivery=type==="delivery";
  const dineInFields=document.getElementById("dineInFields");
  const deliveryFields=document.getElementById("deliveryFields");
  dineInFields.hidden=delivery;
  deliveryFields.hidden=!delivery;
  document.getElementById("tableNumber").required=!delivery;
  document.getElementById("deliveryAddress").required=delivery;
  document.getElementById("deliverySummaryRow").hidden=!delivery;
  renderOrderSummary();
}

function renderOrderSummary(){
  const delivery=document.querySelector('input[name="orderType"]:checked').value==="delivery";
  const totals=getCartTotals();
  const deliveryFee=delivery?DELIVERY_FEE:0;
  document.getElementById("deliveryFeeLabel").textContent=`${DELIVERY_FEE} ج.م`;
  document.getElementById("deliverySummary").textContent=`${deliveryFee} ج.م`;
  document.getElementById("orderGrandTotal").textContent=`${totals.total+deliveryFee} ج.م`;
  document.getElementById("orderPointsPreview").textContent=`النقاط المكتسبة المتوقعة: ${totals.pointsEarned} نقطة (على قيمة الأصناف بعد الخصم، دون رسوم التوصيل).`;
}

function openOrderDetails(){
  const name=document.getElementById("customerName").value.trim();
  const phone=normalizePhone(document.getElementById("customerPhone").value);
  if(!cart.length){
    showCartToast("السلة فاضية.. اختار أصناف الأول");
    return;
  }
  if(!activePhone||phone!==activePhone){
    document.getElementById("customerMessage").textContent="تحقق من رقم هاتفك أولًا لربط الطلب بالنقاط.";
    return;
  }
  if(!name){
    document.getElementById("customerMessage").textContent="اكتب اسمك قبل متابعة الطلب.";
    document.getElementById("customerName").focus();
    return;
  }
  document.getElementById("orderCustomer").textContent=`الاسم: ${name} | الهاتف: ${phone}`;
  document.getElementById("orderModal").hidden=false;
  updateOrderType();
}

const drawer=document.getElementById("drawer");
const backdrop=document.getElementById("drawerBackdrop");
function openDrawer(){drawer.classList.add("open");backdrop.classList.add("show")}
function closeDrawer(){drawer.classList.remove("open");backdrop.classList.remove("show")}
window.closeDrawer=closeDrawer;
window.filterCategory=filterCategory;

document.getElementById("menuBtn").onclick=openDrawer;
document.getElementById("closeDrawer").onclick=closeDrawer;
backdrop.onclick=closeDrawer;
document.getElementById("closeCart").onclick=closeCart;
document.getElementById("clearFilter").onclick=()=>filterCategory("الكل");
document.getElementById("customerPhone").oninput=event=>{
  window.clearTimeout(phoneLookupTimer);
  const phone=normalizePhone(event.target.value);
  if(phone===activePhone) return;
  activePhone="";
  pointsBalance=0;
  pointsToUse=0;
  document.getElementById("customerMessage").textContent=isCompletePhone(phone)
    ? "جاري تحميل رصيد النقاط..."
    : "اكتب رقم الهاتف وسيظهر رصيد نقاطك تلقائيًا.";
  renderCart();
  if(isCompletePhone(phone)) phoneLookupTimer=window.setTimeout(loadPointsForPhone,350);
};
document.getElementById("couponForm").onsubmit=event=>{
  event.preventDefault();
  const code=document.getElementById("couponCode").value.trim().toUpperCase();
  const coupon=couponCodes[code];
  if(!coupon||coupon.enabled===false){
    activeCoupon=null;
    couponFeedback="الكود غير صحيح أو غير متاح.";
  }else{
    activeCoupon={code,...coupon};
    couponFeedback=`تم تطبيق ${activeCoupon.label}`;
  }
  renderCart();
};
document.getElementById("pointsInput").oninput=event=>{
  pointsToUse=Math.max(0,Number(event.target.value)||0);
  renderCart();
};
document.getElementById("useMaxPoints").onclick=()=>{
  pointsToUse=getCartTotals().maxRedeemablePoints;
  renderCart();
};
document.getElementById("checkout").onclick=openOrderDetails;
document.getElementById("closeOrder").onclick=()=>{document.getElementById("orderModal").hidden=true};
document.getElementById("backToCart").onclick=()=>{document.getElementById("orderModal").hidden=true};
document.querySelectorAll('input[name="orderType"]').forEach(input=>input.onchange=updateOrderType);

const searchModal=document.getElementById("searchModal");
const searchInput=document.getElementById("searchInput");
function closeSearch(){searchModal.hidden=true}
function openSearch(){searchModal.hidden=false;searchInput.focus()}
document.getElementById("closeSearch").onclick=closeSearch;
searchModal.onclick=event=>{if(event.target===searchModal) closeSearch()};
document.getElementById("searchForm").onsubmit=event=>{
  event.preventDefault();
  currentCategory="الكل";
  currentSearch=searchInput.value.trim();
  renderCategories();
  renderProducts();
  closeSearch();
  document.getElementById("popular").scrollIntoView({behavior:"smooth",block:"start"});
};

document.querySelectorAll("[data-nav]").forEach(btn=>{
  btn.onclick=()=>{
    const type=btn.dataset.nav;
    if(type==="cart") openCart();
    else if(type==="menu") openDrawer();
    else if(type==="home") window.scrollTo({top:0,behavior:"smooth"});
    else if(type==="search") openSearch();
    else if(type==="account") alert("صفحة الحساب جاهزة للتوصيل بنظام تسجيل دخول لاحقاً.");
  };
});

document.getElementById("orderForm").onsubmit=event=>{
  event.preventDefault();
  if(!cart.length) return showCartToast("السلة فاضية.. اختار أصناف الأول");
  if(!activePhone||normalizePhone(document.getElementById("customerPhone").value)!==activePhone){
    document.getElementById("orderModal").hidden=true;
    document.getElementById("customerMessage").textContent="تحقق من رقم هاتفك قبل إرسال الطلب.";
    return;
  }
  const customerName=document.getElementById("customerName").value.trim();
  if(!customerName){
    document.getElementById("orderModal").hidden=true;
    document.getElementById("customerMessage").textContent="اكتب اسمك قبل متابعة الطلب.";
    return;
  }
  const orderType=document.querySelector('input[name="orderType"]:checked').value;
  const deliveryFee=orderType==="delivery"?DELIVERY_FEE:0;
  const tableNumber=document.getElementById("tableNumber").value.trim();
  const address=document.getElementById("deliveryAddress").value.trim();
  const notes=document.getElementById("orderNotes").value.trim();
  const totals=getCartTotals();
  const text=[
    "طلب من كبابجي المصطفى",
    `الاسم: ${customerName}`,
    `الهاتف: ${activePhone}`,
    orderType==="delivery"?"طريقة الطلب: دليفري":"طريقة الطلب: صالة",
    orderType==="delivery"?`العنوان: ${address}`:`رقم الترابيزة: ${tableNumber}`,
    ...cart.map(item=>`${item.name}${item.optionLabel?` (${item.optionLabel})`:""} × ${item.qty}`),
    `قيمة الأصناف: ${totals.subtotal} ج.م`,
    activeCoupon?`كود الخصم ${activeCoupon.code}: -${totals.couponDiscount} ج.م`:null,
    totals.pointsUsed?`النقاط المستخدمة ${totals.pointsUsed}: -${totals.pointsDiscount} ج.م`:null,
    deliveryFee?`رسوم التوصيل: ${deliveryFee} ج.م`:null,
    `الإجمالي: ${totals.total+deliveryFee} ج.م`,
    notes?`ملاحظات: ${notes}`:null,
    `النقاط المكتسبة: ${totals.pointsEarned}`
  ].filter(Boolean).join("\n");
  const whatsappUrl=`https://wa.me/?text=${encodeURIComponent(text)}`;
  const whatsappWindow=window.open(whatsappUrl,"_blank");
  if(!whatsappWindow){
    showCartToast("اسمح بفتح واتساب لإتمام الطلب");
    return;
  }
  pointsBalance=Math.max(0,pointsBalance-totals.pointsUsed)+totals.pointsEarned;
  pointAccounts[activePhone]={name:customerName,points:pointsBalance};
  savePointAccounts();
  localStorage.setItem("kababgyActivePhone",activePhone);
  cart=[];
  activeCoupon=null;
  couponFeedback="أدخل كود الخصم لتطبيقه على الطلب.";
  pointsToUse=0;
  document.getElementById("couponCode").value="";
  document.getElementById("orderForm").reset();
  document.getElementById("orderModal").hidden=true;
  document.getElementById("customerMessage").textContent=`تم حفظ ${pointsBalance} نقطة على رقمك.`;
  saveCart();
  renderCart();
  closeCart();
  showCartToast(`كسبت ${totals.pointsEarned} نقطة على رقم ${activePhone}`);
};

saveCart();
renderCategories();
renderOffers();
renderProducts();
