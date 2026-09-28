const menuData=window.RESTAURANT_MENU;
const keys=menuData.storageKeys;
const sessionKey="kababgyAdminUnlocked";
const $=selector=>document.querySelector(selector);
const authScreen=$("#authScreen");
const dashboard=$("#dashboard");
const authForm=$("#authForm");
const authMessage=$("#authMessage");
let products=loadArray(keys.products,menuData.products);
let coupons=loadObject(keys.coupons,menuData.coupons);
let toastTimer;
let selectedProductImage="";

function clone(value){return JSON.parse(JSON.stringify(value))}
function loadArray(key,fallback){
  try{
    const saved=localStorage.getItem(key);
    if(saved===null){const initial=clone(fallback);localStorage.setItem(key,JSON.stringify(initial));return initial}
    const parsed=JSON.parse(saved);
    return Array.isArray(parsed)?parsed:clone(fallback);
  }catch{return clone(fallback)}
}
function loadObject(key,fallback){
  try{
    const saved=localStorage.getItem(key);
    if(saved===null){const initial=clone(fallback);localStorage.setItem(key,JSON.stringify(initial));return initial}
    const parsed=JSON.parse(saved);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:clone(fallback);
  }catch{return clone(fallback)}
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function saveProducts(){
  try{
    localStorage.setItem(keys.products,JSON.stringify(products));
  }catch{
    products=loadArray(keys.products,menuData.products);
    showToast("تعذر حفظ الصورة؛ قد تكون مساحة التخزين ممتلئة.");
    return false;
  }
  updateStats();
  showToast("تم حفظ المنتجات والأسعار");
  return true;
}
function saveCoupons(){
  localStorage.setItem(keys.coupons,JSON.stringify(coupons));
  updateStats();
  showToast("تم حفظ أكواد الخصم");
}
function showToast(message){
  const toast=$("#adminToast");
  toast.textContent=message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer=window.setTimeout(()=>toast.classList.remove("show"),2200);
  $("#saveStatus").textContent=`آخر تعديل: ${new Date().toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}`;
}
function updateStats(){
  $("#productCount").textContent=products.length;
  $("#featuredCount").textContent=products.filter(product=>product.featured).length;
  $("#couponCount").textContent=Object.values(coupons).filter(coupon=>coupon.enabled!==false).length;
}
function toHex(bytes){return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")}
function fromHex(value){return new Uint8Array(value.match(/.{2}/g).map(byte=>parseInt(byte,16)))}
async function hashPassword(password,saltHex){
  if(!window.crypto?.subtle) throw new Error("تشفير كلمة المرور يحتاج تشغيل الموقع عبر HTTPS أو localhost.");
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:fromHex(saltHex),iterations:180000,hash:"SHA-256"},material,256);
  return toHex(new Uint8Array(bits));
}
function getAuthRecord(){
  try{return JSON.parse(localStorage.getItem(keys.auth)||"null")}catch{return null}
}
function randomSalt(){
  const salt=new Uint8Array(16);
  crypto.getRandomValues(salt);
  return toHex(salt);
}
function configureAuthScreen(){
  const firstSetup=!getAuthRecord();
  $("#authTitle").textContent=firstSetup?"إنشاء كلمة مرور الإدارة":"دخول الإدارة";
  $("#authDescription").textContent=firstSetup?"أنشئ كلمة مرور من ٨ أحرف أو أكثر لحماية لوحة الإدارة على هذا المتصفح.":"أدخل كلمة مرور لوحة الإدارة للمتابعة.";
  $("#confirmPasswordGroup").hidden=!firstSetup;
  $("#confirmAdminPassword").required=firstSetup;
  $("#adminPassword").autocomplete=firstSetup?"new-password":"current-password";
  $("#authSubmit").textContent=firstSetup?"إنشاء كلمة المرور":"دخول";
}
async function verifyPassword(password){
  const record=getAuthRecord();
  if(!record)return false;
  const candidate=await hashPassword(password,record.salt);
  return candidate===record.hash;
}
async function setPassword(password){
  const salt=randomSalt();
  const hash=await hashPassword(password,salt);
  localStorage.setItem(keys.auth,JSON.stringify({salt,hash}));
}
function showDashboard(){
  authScreen.hidden=true;
  dashboard.hidden=false;
  $("#logoutButton").hidden=false;
  $("#changePasswordButton").hidden=false;
  initializeDashboard();
}
function showLogin(){
  sessionStorage.removeItem(sessionKey);
  dashboard.hidden=true;
  authScreen.hidden=false;
  $("#logoutButton").hidden=true;
  $("#changePasswordButton").hidden=true;
  configureAuthScreen();
}

authForm.onsubmit=async event=>{
  event.preventDefault();
  const password=$("#adminPassword").value;
  const record=getAuthRecord();
  authMessage.textContent="جارٍ التحقق...";
  $("#authSubmit").disabled=true;
  try{
    if(!record){
      if(password.length<8) throw new Error("كلمة المرور يجب أن تكون ٨ أحرف على الأقل.");
      if(password!==$("#confirmAdminPassword").value) throw new Error("كلمتا المرور غير متطابقتين.");
      await setPassword(password);
    }else if(!await verifyPassword(password)){
      throw new Error("كلمة المرور غير صحيحة.");
    }
    sessionStorage.setItem(sessionKey,"1");
    showDashboard();
  }catch(error){
    authMessage.textContent=error.message||"تعذر التحقق من كلمة المرور.";
  }finally{
    $("#authSubmit").disabled=false;
  }
};

function initializeDashboard(){
  fillCategorySelects();
  renderProductList();
  renderOfferList();
  renderCouponList();
  updateStats();
  activatePanel("productsPanel");
}
function fillCategorySelects(){
  const options=menuData.categories.map(([name])=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  $("#productCategory").innerHTML=options;
  $("#productCategoryFilter").innerHTML=`<option value="">كل الأقسام</option>${options}`;
}
function filteredProducts(search,category=""){
  const query=search.trim().toLocaleLowerCase("ar");
  return products.filter(product=>(!category||product.cat===category)&&(!query||`${product.name} ${product.desc} ${product.cat}`.toLocaleLowerCase("ar").includes(query)));
}
function renderProductList(){
  const filtered=filteredProducts($("#productSearch").value,$("#productCategoryFilter").value);
  if(!filtered.length){$("#productList").innerHTML='<div class="empty-state">لا توجد منتجات مطابقة.</div>';return}
  $("#productList").innerHTML=filtered.map(product=>`
    <article class="admin-product">
      <div><h3>${escapeHtml(product.name)}<span class="category-badge">${escapeHtml(product.cat)}</span></h3>
      <p>${product.options?.length?`${product.options.length} أوزان/أسعار`: `${Number(product.price)||0} ج.م`}${product.featured?" · ضمن العروض":""}</p></div>
      <div class="admin-product-actions"><span class="price-badge">${product.options?.length?`يبدأ من ${Math.min(...product.options.map(option=>Number(option.price)||0))}`:`${Number(product.price)||0}`} ج.م</span><button class="secondary-button" type="button" data-edit-product="${product.id}">تعديل</button></div>
    </article>`).join("");
}
function renderVariantRows(options=[]){
  $("#variantList").innerHTML=options.map(option=>variantRow(option.label,option.price)).join("");
}
function variantRow(label="",price=""){
  return `<div class="variant-row"><input class="variant-label" type="text" maxlength="35" placeholder="مثال: نصف كيلو" value="${escapeHtml(label)}"><input class="variant-price" type="number" min="0" step="0.01" placeholder="السعر" value="${escapeHtml(price)}"><button type="button" class="remove-variant" aria-label="حذف الوزن">×</button></div>`;
}
function openProductEditor(product=null){
  const form=$("#productForm");
  form.hidden=false;
  $("#productFormTitle").textContent=product?"تعديل الصنف":"صنف جديد";
  $("#productId").value=product?.id??"";
  $("#productName").value=product?.name??"";
  $("#productCategory").value=product?.cat??menuData.categories[0][0];
  $("#productPrice").value=product?.price??"";
  selectedProductImage=product?.img??"";
  $("#productImage").value=selectedProductImage.startsWith("data:")?"":selectedProductImage;
  $("#productImageFile").value="";
  showProductImagePreview(selectedProductImage);
  $("#productDescription").value=product?.desc??"";
  $("#productFeatured").checked=Boolean(product?.featured);
  $("#deleteProductButton").hidden=!product;
  $("#deleteProductButton").dataset.id=product?.id??"";
  renderVariantRows(product?.options||[]);
  form.scrollIntoView({behavior:"smooth",block:"start"});
  $("#productName").focus({preventScroll:true});
}
function closeProductEditor(){
  $("#productForm").reset();
  $("#productForm").hidden=true;
  $("#variantList").replaceChildren();
  selectedProductImage="";
  showProductImagePreview("");
}
function showProductImagePreview(source){
  const wrap=$("#imagePreviewWrap");
  wrap.hidden=!source;
  if(source)$("#productImagePreview").src=source;
  else $("#productImagePreview").removeAttribute("src");
}
function optimizeUploadedImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("تعذر قراءة ملف الصورة."));
    reader.onload=()=>{
      const image=new window.Image();
      image.onerror=()=>reject(new Error("ملف الصورة غير صالح."));
      image.onload=()=>{
        const scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        const context=canvas.getContext("2d");
        if(!context){reject(new Error("المتصفح لا يدعم معالجة الصور."));return}
        context.fillStyle="#fff";
        context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        try{resolve(canvas.toDataURL("image/jpeg",0.78))}
        catch{reject(new Error("تعذر تجهيز الصورة للحفظ."))}
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function collectVariants(){
  const rows=[...$("#variantList").querySelectorAll(".variant-row")];
  return rows.map(row=>({label:row.querySelector(".variant-label").value.trim(),price:Number(row.querySelector(".variant-price").value)})).filter(option=>option.label&&Number.isFinite(option.price)&&option.price>=0);
}
$("#productForm").onsubmit=event=>{
  event.preventDefault();
  const idValue=$("#productId").value;
  const oldProduct=products.find(product=>product.id===Number(idValue));
  const name=$("#productName").value.trim();
  const price=Number($("#productPrice").value);
  const options=collectVariants();
  if(!name||!Number.isFinite(price)||price<0){showToast("راجع اسم الصنف والسعر.");return}
  if($("#variantList").children.length!==options.length){showToast("أكمل اسم وسعر كل وزن أو احذف السطر الناقص.");return}
  const updated={
    ...(oldProduct||{}),id:oldProduct?.id??Math.max(0,...products.map(product=>Number(product.id)||0))+1,
    name,cat:$("#productCategory").value,price,
    img:selectedProductImage,
    desc:$("#productDescription").value.trim(),featured:$("#productFeatured").checked
  };
  if(options.length) updated.options=options; else delete updated.options;
  if(oldProduct) products=products.map(product=>product.id===oldProduct.id?updated:product);
  else products.push(updated);
  if(!saveProducts())return;
  renderProductList();
  renderOfferList();
  closeProductEditor();
};
$("#productList").onclick=event=>{
  const button=event.target.closest("[data-edit-product]");
  if(!button)return;
  const product=products.find(item=>item.id===Number(button.dataset.editProduct));
  if(product)openProductEditor(product);
};
$("#productSearch").oninput=renderProductList;
$("#productCategoryFilter").onchange=renderProductList;
$("#newProductButton").onclick=()=>openProductEditor();
$("#cancelProductEdit").onclick=closeProductEditor;
$("#productImageFile").onchange=async event=>{
  const file=event.target.files[0];
  if(!file)return;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    event.target.value="";
    showToast("اختر صورة بصيغة JPG أو PNG أو WebP.");
    return;
  }
  if(file.size>10*1024*1024){
    event.target.value="";
    showToast("حجم الصورة أكبر من ١٠ ميجابايت.");
    return;
  }
  showToast("جارٍ تجهيز الصورة...");
  try{
    selectedProductImage=await optimizeUploadedImage(file);
    $("#productImage").value="";
    showProductImagePreview(selectedProductImage);
    showToast("الصورة جاهزة؛ احفظ الصنف لتثبيتها.");
  }catch(error){showToast(error.message)}
};
$("#productImage").oninput=event=>{
  selectedProductImage=event.target.value.trim();
  $("#productImageFile").value="";
  showProductImagePreview(selectedProductImage);
};
$("#removeProductImage").onclick=()=>{
  selectedProductImage="";
  $("#productImage").value="";
  $("#productImageFile").value="";
  showProductImagePreview("");
};
$("#addVariantButton").onclick=()=>{$("#variantList").insertAdjacentHTML("beforeend",variantRow())};
$("#variantList").onclick=event=>{
  const button=event.target.closest(".remove-variant");
  if(button)button.closest(".variant-row").remove();
};
$("#deleteProductButton").onclick=()=>{
  const id=Number($("#deleteProductButton").dataset.id);
  const product=products.find(item=>item.id===id);
  if(!product||!confirm(`حذف ${product.name} من المنيو؟`))return;
  products=products.filter(item=>item.id!==id);
  saveProducts();
  renderProductList();
  renderOfferList();
  closeProductEditor();
};

function renderOfferList(){
  const filtered=filteredProducts($("#offerSearch").value);
  if(!filtered.length){$("#offerAdminList").innerHTML='<div class="empty-state">لا توجد منتجات مطابقة.</div>';return}
  $("#offerAdminList").innerHTML=filtered.map(product=>`
    <article class="offer-admin-card" data-offer-card="${product.id}">
      <div class="offer-admin-title"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.cat)} · السعر ${Number(product.options?.[0]?.price??product.price)||0} ج.م</small></div>
      <label class="offer-featured"><input type="checkbox" data-featured="${product.id}" ${product.featured?"checked":""}> يظهر في الشريط</label>
      <div class="offer-price-controls">
        <select data-offer-type="${product.id}" aria-label="نوع الخصم"><option value="">بدون خصم</option><option value="percent" ${product.offer?.type==="percent"?"selected":""}>نسبة مئوية</option><option value="fixed" ${product.offer?.type==="fixed"?"selected":""}>مبلغ ثابت</option></select>
        <input data-offer-value="${product.id}" type="number" min="0" step="0.01" value="${product.offer?.value??""}" placeholder="قيمة الخصم" aria-label="قيمة الخصم">
      </div>
      <button class="primary-button offer-save" type="button" data-save-offer="${product.id}">حفظ العرض</button>
    </article>`).join("");
}
$("#offerSearch").oninput=renderOfferList;
$("#offerAdminList").onclick=event=>{
  const button=event.target.closest("[data-save-offer]");
  if(!button)return;
  const id=Number(button.dataset.saveOffer);
  const product=products.find(item=>item.id===id);
  const card=button.closest("[data-offer-card]");
  if(!product||!card)return;
  const type=card.querySelector(`[data-offer-type="${id}"]`).value;
  const value=Number(card.querySelector(`[data-offer-value="${id}"]`).value);
  const featured=card.querySelector(`[data-featured="${id}"]`).checked;
  if(type&&(!Number.isFinite(value)||value<=0||(type==="percent"&&value>100))){showToast("أدخل خصمًا صحيحًا؛ النسبة من ١ إلى ١٠٠٪.");return}
  product.featured=featured;
  if(type){product.offer={type,value,enabled:true}}
  else delete product.offer;
  saveProducts();
};

function renderCouponList(){
  const entries=Object.entries(coupons);
  if(!entries.length){$("#couponAdminList").innerHTML='<div class="empty-state">لم تضف أكواد خصم بعد.</div>';return}
  $("#couponAdminList").innerHTML=entries.map(([code,coupon])=>`
    <article class="coupon-admin-card">
      <div><strong>${escapeHtml(code)}</strong><small>${escapeHtml(coupon.label||coupon.type)} · ${coupon.type==="percent"?`${coupon.value}%`:`${coupon.value} ج.م`}</small></div>
      <label class="coupon-enabled"><input type="checkbox" data-coupon-enabled="${escapeHtml(code)}" ${coupon.enabled===false?"":"checked"}> فعال</label>
      <button class="danger-button" type="button" data-delete-coupon="${escapeHtml(code)}">حذف</button>
    </article>`).join("");
}
$("#couponForm").onsubmit=event=>{
  event.preventDefault();
  const code=$("#couponName").value.trim().toUpperCase();
  const type=$("#couponType").value;
  const value=Number($("#couponValue").value);
  if(!/^[A-Z0-9_-]{3,24}$/.test(code)){showToast("الكود من ٣ إلى ٢٤ حرفًا إنجليزيًا أو رقمًا.");return}
  if(!Number.isFinite(value)||value<=0||(type==="percent"&&value>100)){showToast("أدخل خصمًا صحيحًا؛ النسبة من ١ إلى ١٠٠٪.");return}
  coupons[code]={type,value,label:$("#couponLabel").value.trim()||(type==="percent"?`خصم ${value}%`:`خصم ${value} ج.م`),enabled:true};
  localStorage.setItem(keys.coupons,JSON.stringify(coupons));
  event.target.reset();
  renderCouponList();
  updateStats();
  showToast("تم إضافة كود الخصم");
};
$("#couponAdminList").onchange=event=>{
  const input=event.target.closest("[data-coupon-enabled]");
  if(!input)return;
  coupons[input.dataset.couponEnabled].enabled=input.checked;
  saveCoupons();
  renderCouponList();
};
$("#couponAdminList").onclick=event=>{
  const button=event.target.closest("[data-delete-coupon]");
  if(!button)return;
  const code=button.dataset.deleteCoupon;
  if(!confirm(`حذف كود ${code}؟`))return;
  delete coupons[code];
  saveCoupons();
  renderCouponList();
};

function activatePanel(panelId){
  document.querySelectorAll(".admin-tabs button").forEach(button=>button.classList.toggle("active",button.dataset.panel===panelId));
  document.querySelectorAll(".admin-panel").forEach(panel=>{
    const active=panel.id===panelId;
    panel.hidden=!active;
    panel.classList.toggle("active",active);
  });
}
document.querySelector(".admin-tabs").onclick=event=>{
  const button=event.target.closest("[data-panel]");
  if(button)activatePanel(button.dataset.panel);
};

$("#logoutButton").onclick=showLogin;
$("#changePasswordButton").onclick=()=>$("#passwordDialog").showModal();
$("#closePasswordDialog").onclick=()=>$("#passwordDialog").close();
$("#passwordChangeForm").onsubmit=async event=>{
  event.preventDefault();
  const current=$("#currentAdminPassword").value;
  const next=$("#newAdminPassword").value;
  const confirmation=$("#newAdminPasswordConfirm").value;
  const message=$("#passwordChangeMessage");
  try{
    if(!await verifyPassword(current))throw new Error("كلمة المرور الحالية غير صحيحة.");
    if(next.length<8)throw new Error("كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل.");
    if(next!==confirmation)throw new Error("تأكيد كلمة المرور غير مطابق.");
    await setPassword(next);
    event.target.reset();
    $("#passwordDialog").close();
    showToast("تم تغيير كلمة المرور");
  }catch(error){message.textContent=error.message}
};

configureAuthScreen();
if(sessionStorage.getItem(sessionKey)==="1"&&getAuthRecord())showDashboard();
