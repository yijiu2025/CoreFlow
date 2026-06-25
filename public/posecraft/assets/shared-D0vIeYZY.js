import{ae as X,V as D,N as x,a8 as V,X as q,h3 as G,h4 as F,h5 as J,d_ as z,a2 as P,c3 as R,al as K,ai as Q,av as Y,ak as tt,h6 as et,h7 as nt,h8 as ot,h9 as rt,ha as st,g as it,t as lt,u as at,es as ct,hb as j,a$ as ut,b0 as ht,hc as ft,hd as gt,he as pt,hf as dt,hg as mt,hh as wt,hi as It,hj as St,hk as Et,hl as _,hm as Rt,hn as xt,ho as vt,a7 as W,hp as yt,hq as A,ar as Tt}from"./index-vN0SPdBH.js";/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Mt(n){const t=new Float32Array(n.length);for(let e=0;e<n.length;++e)t[e]=Math.abs(n[e]);return t}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function v(n){return(t,e,o,r,i)=>{const s=X(t,e),a=s.length,l=D(s),c=x(s),u=V(i,c),h=t.length,d=e.length,m=D(t),g=D(e),I=q(t,s),f=q(e,s);if(I.length+f.length===0)for(let p=0;p<u.length;++p)u[p]=n(o[p%o.length],r[p%r.length]);else for(let p=0;p<u.length;++p){const w=G(p,a,l),E=w.slice(-h);I.forEach(b=>E[b]=0);const S=F(E,h,m),y=w.slice(-d);f.forEach(b=>y[b]=0);const T=F(y,d,g);u[p]=n(o[S],r[T])}return[u,s]}}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function bt(n,t,e,o){if(o==="int32"){const r=Int32Array.from(n);return[t,"int32",r]}if(o==="bool"){const r=J([0],e),[i,s]=v((a,l)=>a!==l?1:0)(t,[],n,r,"bool");return[s,"bool",i]}throw new Error(`Error in Cast: failed to cast ${e} to ${o}`)}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Pt=v((n,t)=>n+t);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Ot(n,t,e,o,r){const i=x(o),s=z(r,e);for(let a=0;a<n.length;a++){const l=n[a];if(l<0)throw new Error("Input x must be non-negative!");l>=r||(i>0?s[l]+=t[a]:s[l]+=1)}return s}function Dt(n,t,e,o=!1){const r=n.shape[0],i=n.shape[1],s=P([r,e],t.dtype);for(let a=0;a<r;a++)for(let l=0;l<i;l++){const c=n.get(a,l);if(c<0)throw new Error("Input x must be non-negative!");c>=e||(o?s.set(1,a,c):t.size>0?s.set(s.get(a,c)+t.get(a,l),a,c):s.set(s.get(a,c)+1,a,c))}return s}/**
 * @license
 * Copyright 2023 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const At=v((n,t)=>n&t);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function O(n){return(t,e,o)=>{const r=R(e,t.length);for(let i=0;i<t.length;++i)r[i]=n(t[i],o);return r}}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Lt=O(n=>Math.ceil(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Vt(n,t,e,o){const r=R(e,x(t));if(o&&e!=="string"){let i=0;n.forEach(s=>{const a=x(s.shape);r.set(s.vals,i),i+=a})}else{let i=0;n.forEach(s=>{const a=e==="string"?K(s.vals):s.vals;let l=0;for(let c=0;c<s.shape[0];++c){const u=c*t[1]+i;for(let h=0;h<s.shape[1];++h)r[u+h]=a[l++]}i+=s.shape[1]})}return r}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const zt=v((n,t)=>n===t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const $t=O(n=>Math.exp(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Nt=O(n=>Math.expm1(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Wt=O(n=>Math.floor(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Ft=v((n,t)=>Math.floor(n/t));/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function jt(n,t,e,o,r,i,s,a,l){const c=P([o,i],e);for(let u=0;u<o;u++){const h=[];let d=0;for(let m=0;m<r;m++){const g=n[u*r+m];d+=g*s[m],h.push(g)}if(d<0||d>=l/i)throw new Error(`Invalid indices: ${h} does not index into ${a}`);for(let m=0;m<i;m++)c.values[u*i+m]=t.get(...t.indexToLoc(d*i+m))}return c}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Gt(n,t,e){const o=P(e,n.dtype);for(let r=0;r<o.size;++r){const s=o.indexToLoc(r).slice(),a=s[0],l=s[2],c=t.locToIndex([a,l]);s[2]=t.values[c];const u=n.locToIndex(s);0<=u&&u<n.values.length&&(o.values[r]=n.values[u])}return o}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const qt=v((n,t)=>n>t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const _t=v((n,t)=>n>=t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Ct=v((n,t)=>n<t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const kt=v((n,t)=>n<=t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Ut(n,t,e){const o=(t-n)/(e-1),r=z(e,"float32");r[0]=n;for(let i=1;i<r.length;i++)r[i]=r[i-1]+o;return r}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Bt=O(n=>Math.log(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Kt(n,t,e,o){const r=V(o,x(e));for(let i=0;i<r.length;++i){const s=i*t;let a=n[s];for(let l=0;l<t;++l){const c=n[s+l];(Number.isNaN(c)||c>a)&&(a=c)}r[i]=a}return r}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Zt=v((n,t)=>Math.max(n,t));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Ht=v((n,t)=>Math.min(n,t));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Z=v((n,t)=>n*t);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Xt(n,t,e){const o=Q(-1,e);return Z([],t,o,n,e)}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Jt=v((n,t)=>n!==t?1:0);/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Qt(n,t,e,o,r){const i=t.length,s=x(t),a=D(t),l=D(r),c=V(e,x(r));for(let u=0;u<s;++u){const h=G(u,i,a),d=new Array(h.length);for(let g=0;g<d.length;g++)d[g]=h[o[g]];const m=F(d,i,l);c[m]=n[u]}return c}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Yt(n,t,e,o){const[r,i]=Y(n,o),s=tt(t,"int32"),a=z(x(r),s),l=x(i);for(let c=0;c<a.length;++c){const u=c*l;let h=1;for(let d=0;d<l;++d)h*=e[u+d];a[c]=h}return{outVals:a,outShape:r,outDtype:s}}/**
 * @license
 * Copyright 2022 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function te(n,t,e){n.forEach((o,r)=>{if(o<0||o>=e){const i=G(r,t.length,D(t)).join(",");throw new Error(`indices[${i}] = ${o} is not in [0, ${e})`)}})}function ee(n,t){for(let e=0;e<n.length;++e){const o=n[e],r=e===n.length-1?t:n[e+1].length;if(o.length===0)throw new Error("Ragged splits may not be empty");if(o[0]<0)throw new Error("Ragged splits must be non-negative");if(o[o.length-1]>r)throw new Error("Ragged splits must not point past values");for(let i=1;i<o.length;++i)if(o[i-1]>o[i])throw new Error("Ragged splits must be sorted in ascending order")}}function ne(n,t,e,o){const r=[];let i=0;const s=t.length-1+e.length,a=new Array(s).fill(null).map(()=>[0]);ee(e,o);let l=1;for(let c=0;c<t.length-1;++c){l*=t[c];const u=t[c+1];for(let h=1;h<l+1;++h)a[c].push(h*u)}for(let c=0;c<n.length;++c){let u=n[c],h=n[c]+1;for(let d=0;d<e.length;++d){const m=e[d],g=d+t.length-1;if(g>=0){const I=a[g],f=I[I.length-1]-m[u];for(let p=u;p<h;++p)a[g].push(m[p+1]+f)}u=m[u],h=m[h]}h!==u&&(r.push([u,h]),i+=h-u)}return{outSplits:a,valueSlices:r,numValues:i}}function oe(n){const t=[];for(let e=0;e<n.length;++e){const o=n[e].length,r=R("int32",o);t.push(r),n[e].forEach((i,s)=>r[s]=i)}return t}function C(n,t){const e=n.slice(0,t);for(;e.length<t;)e.push(1);for(let o=t;o<n.length;o++)e[t-1]*=n[o];return e}function re(n,t,e,o,r,i){const s=C(t,2)[1],a=C(i,2)[1];let l=0;for(const c of e)for(let u=c[0];u<c[1];++u){for(let h=0;h<o;++h)r[l*a+h]=n[u*s+h];++l}}function se(n,t,e,o,r){const i=t.slice();i[0]=r;const s=R(e,x(i)),a=n.length,l=a===0?0:a/t[0];return re(n,t,o,l,s,i),[s,i]}function ie(n,t,e,o,r,i,s,a){if(n.length===0)throw new Error("paramsNestedSplits must be non empty");if(t[0].length===0)throw new Error("Split tensors must not be scalars");const l=t[0][0]-1;if(te(i,s,l),o.length===0)throw new Error("params.rank must be nonzero");const c=o[0],{outSplits:u,valueSlices:h,numValues:d}=ne(i,s,n,c),m=oe(u),g=se(e,o,r,h,d);return[m,g[0],g[1]]}/**
 * @license
 * Copyright 2022 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const k=2147483647;function le(n,t,e,o,r,i,s){if(t.length>1)throw new Error("starts must be a scalar or vector");if(r.length>1)throw new Error("limits must be a scalar or vector");if(s.length>1)throw new Error("deltas must be a scalar or vector");const a=t.length===0,l=r.length===0,c=s.length===0,u=[];a||u.push(t[0]),l||u.push(r[0]),c||u.push(s[0]);for(let f=1;f<u.length;++f)if(u[f]!==u[f-1])throw new Error("starts, limits, and deltas must have the same shape");const h=u.length===0?1:u[0],d=R("int32",h+1);d[0]=0;for(let f=0;f<h;++f){const p=a?n[0]:n[f],w=l?o[0]:o[f],E=c?i[0]:i[f];if(E===0)throw new Error("Requires delta != 0");let S;if(E>0&&w<p||E<0&&w>p)S=0;else if(S=Math.ceil(Math.abs((w-p)/E)),S>k)throw new Error(`Requires ((limit - start) / delta) <= ${k}`);d[f+1]=d[f]+S}const m=d[h],g=R(e,m);let I=0;for(let f=0;f<h;++f){const p=d[f+1]-d[f];let w=a?n[0]:n[f];const E=c?i[0]:i[f];for(let S=0;S<p;++S)g[I++]=w,w+=E}return[d,g]}/**
 * @license
 * Copyright 2022 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */var M=ot;class N{constructor(t,e,o,r,i,s,a,l,c,u){this.shape=t,this.shapeShape=e,this.values=o,this.valuesShape=r,this.valuesDType=i,this.defaultValue=s,this.defaultValueShape=a,this.rowPartitionValues=l,this.rowPartitionValuesShapes=c,this.rowPartitionTypes=et(u),this.raggedRank=nt(this.rowPartitionTypes)}getRowPartitionTypeByDimension(t){return this.rowPartitionTypes[0]===M.FIRST_DIM_SIZE?this.rowPartitionTypes[t+1]:this.rowPartitionTypes[t]}getRowPartitionTensor(t){return this.rowPartitionTypes[0]===M.FIRST_DIM_SIZE?this.rowPartitionValues[t+1]:this.rowPartitionValues[t]}getMaxWidth(t){const e=this.getRowPartitionTensor(t-1);switch(this.getRowPartitionTypeByDimension(t-1)){case M.VALUE_ROWIDS:return N.getMaxWidthValueRowID(e);case M.ROW_SPLITS:return N.getMaxWidthRowSplit(e);default:throw new Error(`Cannot handle partition type ${M[this.getRowPartitionTypeByDimension(t-1)]}`)}}static getMaxWidthRowSplit(t){const e=t.length;if(e===0||e===1)return 0;let o=0;for(let r=0;r<e-1;++r){const i=t[r+1]-t[r];i>o&&(o=i)}return o}static getMaxWidthValueRowID(t){const e=t.length;if(e===0)return 0;let o=0,r=t[0],i=0;for(let s=1;s<e;++s){const a=t[s];a!==r&&(r=a,i=Math.max(s-o,i),o=s)}return Math.max(e-o,i)}tensorShapeFromTensor(t,e,o=!0){if(e.length===0){if(t[0]===-1)return[];throw new Error("The only valid scalar shape tensor is the fully unknown shape specified as -1.")}return B(t,o)}calculateOutputSize(t){const e=this.valuesShape,o=this.defaultValueShape;rt(o,e);const r=this.tensorShapeFromTensor(this.shape,this.shapeShape),s=st(this.raggedRank,r,e);s[0]<0&&(s[0]=t);for(let a=1;a<=this.raggedRank;++a)s[a]<0&&(s[a]=this.getMaxWidth(a));return s}calculateFirstParentOutputIndex(t,e,o){const r=Math.min(t,o),i=[];let s=0;for(let a=0;a<r;++a,s+=e)i.push(s);for(let a=r;a<t;++a)i.push(-1);return it(i.length===t,()=>"Final length of result must be equal to firstDimension."),i}calculateOutputIndexRowSplit(t,e,o,r){const i=t.length,s=[];for(let a=0;a<i-1;++a){const l=t[a+1]-t[a];let c=Math.min(r,l),u=e[a];u===-1&&(c=0);for(let h=0;h<c;++h)s.push(u),u+=o;for(let h=0;h<l-c;++h)s.push(-1)}if(i>0&&s.length!==t[i-1])throw new Error("Invalid row split size.");return s}calculateOutputIndexValueRowID(t,e,o,r){const i=t.length,s=[];if(i===0)return[];let a=0,l=t[0];if(l>=e.length)throw new Error(`Got currentValueRowId=${l}, which is not less than ${e.length}`);let c=e[l];s.push(c);for(let u=1;u<i;++u){const h=t[u];if(h===l)c>=0&&(++a,a<r?c+=o:c=-1);else{if(a=0,l=h,h>=e.length)throw new Error(`Got nextValueRowId=${h} which is not less than ${e.length}`);c=e[h]}s.push(c)}if(s.length!==t.length)throw new Error("Invalid row ids.");return s}calculateOutputIndex(t,e,o,r){const i=this.getRowPartitionTensor(t),s=this.getRowPartitionTypeByDimension(t);switch(s){case M.VALUE_ROWIDS:return this.calculateOutputIndexValueRowID(i,e,o,r);case M.ROW_SPLITS:if(i.length-1>e.length)throw new Error(`Row partition size is greater than output size: ${i.length-1} > ${e.length}`);return this.calculateOutputIndexRowSplit(i,e,o,r);default:throw new Error(`Unsupported partition type: ${M[s]}`)}}getFirstDimensionSize(){const t=this.rowPartitionValues[0];if(this.rowPartitionTypes.length===0)throw new Error("No row_partition_types given.");const e=this.rowPartitionTypes[0];switch(e){case M.FIRST_DIM_SIZE:return t[0];case M.VALUE_ROWIDS:throw new Error("Cannot handle VALUE_ROWIDS in first dimension.");case M.ROW_SPLITS:return this.rowPartitionValuesShapes[0][0]-1;default:throw new Error(`Cannot handle type ${M[e]}`)}}compute(){if(this.rowPartitionValues[0].length<=0)throw new Error("Invalid first partition input. Tensor requires at least one element.");const e=this.getFirstDimensionSize(),o=this.calculateOutputSize(e),r=new Array(this.raggedRank+1);r[r.length-1]=1;for(let l=r.length-2;l>=0;--l)r[l]=r[l+1]*o[l+1];const i=B(o,!1),s=R(this.valuesDType,x(i));if(r[0]*o[0]>0){let l=this.calculateFirstParentOutputIndex(e,r[0],o[0]);for(let c=1;c<=this.raggedRank;++c)l=this.calculateOutputIndex(c-1,l,r[c],o[c]);this.setOutput(this.raggedRank,l,s,i)}return[i,s]}setOutput(t,e,o,r){if(o.length===0)return;const i=this.values,s=o;let a=r.slice();a=a.slice(t+1);const l=x(a),c=e.length;let u=this.defaultValue;if(u.length!==l&&u.length!==1){const g=this.defaultValueShape;lt(()=>{const I=at(u,g);u=ct(I,a).dataSync()})}let h=0,d=0,m=0;for(let g=0;g<=c;++g){let I=g<c?e[g]:-1;if(I===m){++m;continue}if(d<m){const f=i.subarray(h*l),p=s.subarray(d*l),w=(m-d)*l;U(p,f,w)}if(g>=c){const f=o.length;I=Math.floor(f/l)}if(I>m)if(this.defaultValue.length===1)s.subarray(m*l,I*l).fill(this.defaultValue[0]),m=I;else for(;I>m;){const f=s.slice(m*l);U(f,u,l),++m}I<0?(h=g+1,d=m):(h=g,d=m,m=d+1)}}}function U(n,t,e){for(let o=0;o<e;o++)n[o]=t[o]}function B(n,t){const e=[];for(let o of n){if(o<0){if(!t)throw new Error(`Dimension ${o} must be >= 0`);if(o<-1)throw new Error(`Dimension ${o} must be >= -1`);o=-1}e.push(o)}return e}function ae(n,t,e,o,r,i,s,a,l,c){return new N(n,t,e,o,r,i,s,a,l,c).compute()}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ce(n,t,e,o){const r=n===t,i=n<t&&e<0,s=t<n&&e>1;if(r||i||s)return z(0,o);const a=Math.abs(Math.ceil((t-n)/e)),l=z(a,o);t<n&&e===1&&(e=-1),l[0]=n;for(let c=1;c<l.length;c++)l[c]=l[c-1]+e;return l}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const ue=O(n=>1/Math.sqrt(n));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function he(n,t,e,o,r,i,s,a,l,c){const u=[o/r,r],h=n.values,d=t.values;if(o===0)return P(e,t.dtype);const m=l instanceof j?l:P(u,t.dtype);typeof l=="string"||typeof l=="number"?m.values.fill(l):typeof l=="boolean"&&m.values.fill(+l);for(let g=0;g<i;g++){const I=[];let f=0;for(let p=0;p<s;p++){const w=h[g*s+p];I.push(w),f+=w*a[p]}if(f<0||f>=o/r)throw new Error(`Invalid indices: ${I} does not index into ${e}`);for(let p=0;p<r;p++)m.values[f*r+p]=t.rank===0?d[0]:d[g*r+p]}return m}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const fe=O(n=>1/(1+Math.exp(-n)));/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ge(n,t,e,o,r){const i=ut(o,t,e),s=x(e),a=D(o);if(i){const h=ht(t,a);return r==="string"?n.slice(h,h+s):n.subarray(h,h+s)}const l=r==="string"?K(n):n,c=P(o,r,l),u=P(e,r);for(let h=0;h<u.size;++h){const d=u.indexToLoc(h),m=d.map((g,I)=>g+t[I]);u.set(c.get(...m),...d)}return r==="string"?ft(u.values):u.values}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function pe(n,t,e,o,r,i,s){const a=t[0],l=i[0],c=new Array(l),u=new Array(a),h=t[1];if(l===0){if(a!==0)throw new Error(gt(a));const f=R(e,0),p=R(r,0);return[f,[0,h],p,c,u]}let d=!0,m=0;const g=new Array(l).fill(0);for(let f=0;f<a;++f){const p=n[f*h];if(p<0)throw new Error(pt(f,p));if(p>=l)throw new Error(dt(f,p,l));++g[p],d=d&&p>=m,m=p}let I=!0;for(let f=0;f<l;++f){const p=g[f]===0;c[f]=p,I=I&&!p,g[f]=Math.max(g[f],1),f>0&&(g[f]+=g[f-1])}if(I&&d){const f=n,p=o;for(let w=0;w<a;++w)u[w]=w;return[f,[a,h],p,c,u]}else{const f=g[l-1],p=R(e,f*h),w=R(r,f),E=new Array(l).fill(0);for(let S=0;S<a;++S){const y=n[S*h],T=E[y],b=(y===0?0:g[y-1])+T;E[y]++;for(let $=0;$<h;++$)p[b*h+$]=n[S*h+$];w[b]=o[S],u[S]=b}for(let S=0;S<l;++S)if(E[S]===0){const T=S===0?0:g[S-1];p[T*h+0]=S;for(let b=1;b<h;++b)p[T*h+b]=0;w[T]=s}return[p,[f,h],w,c,u]}}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function de(n,t,e,o,r){const i=x(o),s=t[0],a=r.length,l=[];let c=1,u=-1;for(let f=0;f<a;++f){const p=r[f];if(p===-1){if(u!==-1)throw new Error(mt(u,f));u=f,l.push(1)}else{if(p<0)throw new Error(wt(f,p));c*=p,l.push(p)}}if(u!==-1){if(c<=0)throw new Error(It());const f=Math.trunc(i/c);if(c*f!==i)throw new Error(St(o,l));l[u]=f}if(x(l)!==i)throw new Error(Et(o,l));const d=o.length,m=[];if(d>0){m[d-1]=1;for(let f=d-2;f>=0;--f)m[f]=m[f+1]*o[f+1]}const g=[];if(a>0){g[a-1]=1;for(let f=a-2;f>=0;--f)g[f]=g[f+1]*l[f+1]}const I=R(e,s*a);for(let f=0;f<s;++f){let p=0;for(let w=0;w<d;++w)p+=n[f*d+w]*m[w];for(let w=0;w<a;++w)I[f*a+w]=Math.trunc(p/g[w]),p%=g[w]}return[I,[s,a],l]}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function me(n,t,e,o,r,i=!1,s=0){const a=o.length,l=[t[0],n.length/t[0]],c=l[1],h=a>0?r[a-1]+1:0;if(h<0)throw new Error(_());const d=t.slice();d[0]=h;const m=d.reduce((E,S)=>E*S,1),g=R(e,m);if(a===0)return h>0&&g.fill(s),[g,d];if(h<=0)throw new Error(_());let I=0,f=1,p=0,w=r[I];for(;;){let E=0;if(f<a){if(E=r[f],w===E){++f;continue}if(w>=E)throw new Error(Rt())}if(w<0||w>=h)throw new Error(xt(w,h));w>p&&g.fill(s,p*c,w*c);for(let S=I;S<f;++S){const y=o[S];if(y<0||y>=l[0])throw new Error(vt(S,o[S],l[0]));for(let T=0;T<c;T++)g[w*c+T]+=n[y*c+T]}if(i)for(let S=0;S<c;S++)g[w*c+S]/=f-I;if(I=f,++f,p=w+1,w=E,f>a)break}return p<h&&g.fill(s,p*c,h*c),[g,d]}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the License);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an AS IS BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const we=O(n=>Math.sqrt(n));/**
 * @license
 * Copyright 2023 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Ie=O((n,t)=>{const{pattern:e,replaceGlobal:o,rewrite:r}=t;return n.replace(new RegExp(e,o?"g":""),r)});/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Se(n,t,e,o){const r=P(n,t.dtype);for(let i=0;i<r.size;i++){const s=r.indexToLoc(i),a=new Array(s.length);for(let l=0;l<a.length;l++)a[l]=s[l]*e[l]+o[l];r.set(t.get(...a),...s)}return r}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */class Ee{constructor(t,e,o,r,i,s){this.separator=W(t),this.nGramWidths=e,this.leftPad=W(o),this.rightPad=W(r),this.padWidth=i,this.preserveShort=s}getPadWidth(t){return Math.min(this.padWidth<0?t-1:this.padWidth,t-1)}getNumNGrams(t,e){const o=this.getPadWidth(e);return Math.max(0,t+2*o-e+1)}createNGrams(t,e,o,r,i,s){for(let a=0;a<i;++a){const l=this.getPadWidth(s),c=Math.max(0,l-a),u=Math.max(0,l-(i-(a+1))),h=s-(c+u),d=e+(c>0?0:a-l);let m=0;m+=c*this.leftPad.length;for(let w=0;w<h;++w)m+=t[d+w].length;m+=u*this.rightPad.length;const g=c+u+h-1;m+=g*this.separator.length,o[r+a]=new Uint8Array(m);const I=o[r+a];let f=0;const p=w=>w.forEach(E=>I[f++]=E);for(let w=0;w<c;++w)p(this.leftPad),p(this.separator);for(let w=0;w<h-1;++w)p(t[d+w]),p(this.separator);if(h>0){p(t[d+h-1]);for(let w=0;w<u;++w)p(this.separator),p(this.rightPad)}else{for(let w=0;w<u-1;++w)p(this.rightPad),p(this.separator);p(this.rightPad)}}}compute(t,e){const o=t.length,r=e.length;if(r>0){let l=e[0];if(l!==0)throw new Error(`First split value must be 0, got ${l}`);for(let c=1;c<r;++c){let u=e[c]>=l;if(u=u&&e[c]<=o,!u)throw new Error(`Invalid split value ${e[c]}, must be in [${l}, ${o}]`);l=e[c]}if(l!==o)throw new Error(`Last split value must be data size. Expected ${o}, got ${l}`)}const i=r-1,s=R("int32",r);if(o===0||r===0){const l=new Array(o);for(let c=0;c<=i;++c)s[c]=0;return[l,s]}s[0]=0;for(let l=1;l<=i;++l){const c=e[l]-e[l-1];let u=0;this.nGramWidths.forEach(h=>{u+=this.getNumNGrams(c,h)}),this.preserveShort&&c>0&&u===0&&(u=1),s[l]=s[l-1]+u}const a=new Array(s[i]);for(let l=0;l<i;++l){const c=e[l];let u=s[l];if(this.nGramWidths.forEach(h=>{const d=e[l+1]-e[l],m=this.getNumNGrams(d,h);this.createNGrams(t,c,a,u,m,h),u+=m}),this.preserveShort&&u===s[l]){const h=e[l+1]-e[l];if(h===0)continue;const d=h+2*this.padWidth;this.createNGrams(t,c,a,u,1,d)}}return[a,s]}}function Re(n,t,e,o,r,i,s,a){return new Ee(e,o,r,i,s,a).compute(n,t)}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function xe(n,t,e,o){if(!n.length)return;if(t.length===0){for(let i=0;i<n.length;++i)o.push(n.subarray(i,i+1));return}if(t.length===1){const i=t[0];let s=n.indexOf(i);for(;s!==-1;){const a=n.subarray(0,s);(!e||a.length!==0)&&o.push(a),n=n.subarray(s+1),s=n.indexOf(i)}(!e||n.length!==0)&&o.push(n);return}let r=0;for(let i=0;i<n.length+1;i++)if(i===n.length||t.indexOf(n[i])!==-1){const s=n.subarray(r,i);(!e||s.length!==0)&&o.push(s),r=i+1}}function ve(n,t,e){const o=n.length,r=[];let i=0,s=0;const a=new Array(o);for(let d=0;d<o;++d){const m=r.length;xe(n[d],t,e,r);const g=r.length-m;a[d]=g,i+=g,s=Math.max(s,g)}const l=R("int32",i*2),c=new Array(i),u=[o,s];let h=0;for(let d=0;d<o;++d)for(let m=0;m<a[d];++m)l[h*2]=d,l[h*2+1]=m,c[h]=r[h],++h;return[l,c,u]}/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function ye(n,t){const e=R("int32",n.length);for(let o=0;o<n.length;++o)e[o]=yt(n[o]).modulo(t).getLowBitsUnsigned();return e}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const Te=v((n,t)=>n-t);/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Me(n,t){const e=new Array(n.rank);for(let r=0;r<e.length;r++)e[r]=n.shape[r]*t[r];const o=P(e,n.dtype);for(let r=0;r<o.values.length;++r){const i=o.indexToLoc(r),s=new Array(n.rank);for(let l=0;l<s.length;l++)s[l]=i[l]%n.shape[l];const a=n.locToIndex(s);o.values[r]=n.values[a]}return o}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const L=(n,t)=>{const e=t.value-n.value;return e===0?n.index-t.index:e};function H(n,t,e=0,o=n.length-1){for(;o>e;){if(o-e>600){const a=o-e+1,l=t-e+1,c=Math.log(a),u=.5*Math.exp(2*c/3),h=.5*Math.sqrt(c*u*(a-u)/a)*Math.sign(l-a/2),d=Math.max(e,Math.floor(t-l*u/a+h)),m=Math.min(o,Math.floor(t+(a-l)*u/a+h));H(n,t,d,m)}const r=n[t];let i=e,s=o;for(A(n,e,t),L(n[o],r)>0&&A(n,e,o);i<s;){for(A(n,i,s),i++,s--;L(n[i],r)<0;)i=i+1;for(;L(n[s],r)>0;)s=s-1}L(n[e],r)===0?A(n,e,s):(s=s+1,A(n,s,o)),s<=t&&(e=s+1),t<=s&&(o=s-1)}}function be(n,t,e,o,r){const i=t[t.length-1],[s,a]=[n.length/i,i],l=V(e,s*o),c=V("int32",s*o);for(let h=0;h<s;h++){const d=h*a,m=n.subarray(d,d+a);let g=new Array(m.length);m.forEach((w,E)=>g[E]={value:w,index:E}),o<g.length&&(H(g,o),g=g.slice(0,o)),r&&g.sort(L);const I=h*o,f=l.subarray(I,I+o),p=c.subarray(I,I+o);for(let w=0;w<o;w++)f[w]=g[w].value,p[w]=g[w].index}const u=t.slice();return u[u.length-1]=o,[P(u,e,l),P(u,"int32",c)]}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */function Pe(n,t,e,o){const r=Tt(t,e)[0],i=[1,e[0],1];for(let g=0;g<r;g++)i[0]*=e[g];i[1]=e[r];for(let g=r+1;g<e.length;g++)i[2]*=e[g];const s=new Map,a=new Int32Array(e[r]),l=new j(i,o,n),c=[],u=i[0]===1&&i[2]===1;for(let g=0;g<e[r];g++){let I;if(u)I=n[g].toString();else{const p=[];for(let w=0;w<i[0];w++)for(let E=0;E<i[2];E++)p.push(l.get(w,g,E));I=p.join(",")}const f=s.get(I);if(f!=null)a[g]=f;else{const p=s.size;s.set(I,p),a[g]=p,c.push(g)}}const h=i.slice();h[1]=s.size;const d=new j(h,o);c.forEach((g,I)=>{for(let f=0;f<i[0];f++)for(let p=0;p<i[2];p++)d.set(l.get(f,g,p),f,I,p)});const m=e.slice();return m[r]=h[1],{outputValues:d.values,outputShape:m,indices:a}}/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */const De=Object.freeze(Object.defineProperty({__proto__:null,addImpl:Pt,bincountImpl:Ot,bincountReduceImpl:Dt,bitwiseAndImpl:At,castImpl:bt,ceilImpl:Lt,concatImpl:Vt,equalImpl:zt,expImpl:$t,expm1Impl:Nt,floorDivImpl:Ft,floorImpl:Wt,gatherNdImpl:jt,gatherV2Impl:Gt,greaterEqualImpl:_t,greaterImpl:qt,lessEqualImpl:kt,lessImpl:Ct,linSpaceImpl:Ut,logImpl:Bt,maxImpl:Kt,maximumImpl:Zt,minimumImpl:Ht,multiplyImpl:Z,negImpl:Xt,notEqualImpl:Jt,prodImpl:Yt,raggedGatherImpl:ie,raggedRangeImpl:le,raggedTensorToTensorImpl:ae,rangeImpl:ce,rsqrtImpl:ue,scatterImpl:he,sigmoidImpl:fe,simpleAbsImpl:Mt,sliceImpl:ge,sparseFillEmptyRowsImpl:pe,sparseReshapeImpl:de,sparseSegmentReductionImpl:me,sqrtImpl:we,staticRegexReplaceImpl:Ie,stridedSliceImpl:Se,stringNGramsImpl:Re,stringSplitImpl:ve,stringToHashBucketFastImpl:ye,subImpl:Te,tileImpl:Me,topKImpl:be,transposeImpl:Qt,uniqueImpl:Pe},Symbol.toStringTag,{value:"Module"}));export{De as s};
