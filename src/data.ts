// Fictional demo profiles. No prices or nutrition are read from photographed packaging.
export type Product = { id: string; name: string; brand: string; type: 'bottle' | 'carton' | 'box'; color: string; ink: string; price: number; nearby: number; online: number; size: string; sugar: number; calories: number; dairy: boolean; aisle: number; category: string };
export const products: Product[] = [
 {id:'lemon',name:'Original energy drink',brand:'DEMO PROFILE 01',type:'bottle',color:'#e4ef77',ink:'#304725',price:4.50,nearby:3.95,online:4.25,size:'500 ml',sugar:22,calories:110,dairy:false,aisle:4,category:'Drinks'},
 {id:'oat',name:'Original oat milk',brand:'OAT SIDE',type:'carton',color:'#98b8f0',ink:'#233656',price:3.80,nearby:4.20,online:3.65,size:'1 liter',sugar:4,calories:120,dairy:false,aisle:6,category:'Dairy & alternatives'},
 {id:'cereal',name:'Honey oat cereal',brand:'GOOD MORNING',type:'box',color:'#ec8a50',ink:'#713817',price:5.20,nearby:5.60,online:4.90,size:'350 g',sugar:9,calories:160,dairy:false,aisle:8,category:'Pantry'},
 {id:'zero',name:'Lower-sugar energy drink',brand:'DEMO PROFILE 02',type:'bottle',color:'#d6e9bc',ink:'#304725',price:4.75,nearby:4.40,online:4.60,size:'500 ml',sugar:0,calories:5,dairy:false,aisle:4,category:'Drinks'},
 {id:'milk',name:'Whole dairy milk',brand:'DAILY',type:'carton',color:'#f7efdb',ink:'#4c606a',price:3.50,nearby:3.70,online:3.90,size:'1 liter',sugar:12,calories:150,dairy:true,aisle:6,category:'Dairy & alternatives'},
 {id:'plain',name:'Unsweetened oat cereal',brand:'GOOD MORNING',type:'box',color:'#cfb593',ink:'#713817',price:5.10,nearby:5.30,online:5.45,size:'350 g',sugar:0,calories:140,dairy:false,aisle:8,category:'Pantry'},
 {id:'pasta',name:'Rigatoni',brand:'CASA PASTA',type:'box',color:'#d8b268',ink:'#624523',price:2.80,nearby:3.20,online:2.95,size:'500 g',sugar:2,calories:180,dairy:false,aisle:8,category:'Pantry'},
 {id:'tomatoes',name:'Cherry tomatoes',brand:'GARDEN',type:'box',color:'#d57657',ink:'#623223',price:3.20,nearby:3.60,online:3.50,size:'300 g',sugar:4,calories:27,dairy:false,aisle:2,category:'Produce'},
 {id:'basil',name:'Fresh basil',brand:'GARDEN',type:'box',color:'#9cae76',ink:'#384b2c',price:1.80,nearby:2.00,online:2.20,size:'1 bunch',sugar:0,calories:5,dairy:false,aisle:2,category:'Produce'},
];
export type Preference = 'off' | 'sugar' | 'dairy';
export function recommendation(p: Product, preference: Preference): { product: Product; reason: string } | null {
 if (preference === 'sugar' && p.sugar > 0 && ['lemon', 'cereal', 'milk'].includes(p.id)) { const alt = products.find(x => x.id === (p.type === 'bottle' ? 'zero' : p.type === 'box' ? 'plain' : 'oat'))!; if (alt.sugar < p.sugar) return {product:alt,reason:`${alt.sugar} g sugar per serving, compared with ${p.sugar} g in your selection.`}; }
 if (preference === 'dairy' && p.dairy) return {product:products[1],reason:'Made from oats. A dairy-free swap for your whole milk.'};
 return null;
}
export const money = (n:number) => `$${n.toFixed(2)}`;
