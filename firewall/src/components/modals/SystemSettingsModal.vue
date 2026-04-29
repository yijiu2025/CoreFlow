<template>
  <transition 
    enter-active-class="transition duration-300 ease-out" 
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100" 
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="opacity-100 scale-100" 
    leave-to-class="opacity-0 scale-95">
    <div v-if="isOpen"
      class="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-6 z-[2000]">
      <div
        class="w-full max-w-6xl h-full max-h-[850px] rounded-[32px] shadow-[0_30px_100px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden relative border transition-all duration-500"
        :class="isDarkMode ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'">

        <!-- Header -->
        <div class="px-8 py-4 border-b flex items-center justify-between transition-colors duration-500"
          :class="isDarkMode ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'">
          <div class="flex items-center gap-4">
            <div class="flex gap-1.5 mr-4">
              <div @click="$emit('close')"
                class="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer transition-colors"></div>
              <div class="w-3 h-3 rounded-full bg-amber-300"></div>
              <div class="w-3 h-3 rounded-full bg-green-400"></div>
            </div>
            <div class="flex items-center gap-3">
              <Settings class="w-6 h-6 text-indigo-500" />
              <h2 class="text-lg font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
                控制中心 <span class="text-indigo-500 opacity-40 mx-1">/</span> {{ currentTabLabel }}
              </h2>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
              :class="isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-indigo-400"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span class="text-[9px] font-black uppercase tracking-widest text-indigo-500">System Ready</span>
            </div>
            <button @click="$emit('close')" class="p-2 rounded-lg hover:bg-slate-500/10 transition-colors">
              <X class="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div class="flex-1 flex overflow-hidden">
          <!-- Sidebar Navigation -->
          <div class="w-72 flex flex-col border-r transition-colors"
            :class="isDarkMode ? 'bg-slate-950/20 border-white/5' : 'bg-slate-50/30 border-slate-100'">

            <nav class="flex-1 px-4 py-8 space-y-1.5">
              <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                class="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group relative border border-transparent"
                :class="activeTab === tab.id ?
                  (isDarkMode ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 shadow-xl' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20') :
                  (isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50')">
                <component :is="tab.icon" class="w-5 h-5 transition-transform group-hover:scale-110" />
                <span class="text-sm font-bold tracking-tight">{{ tab.label }}</span>
                <ChevronRight v-if="activeTab !== tab.id" class="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </nav>
            
            <div class="p-8 border-t border-white/5 bg-black/10">
              <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Build Version</p>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FIREWALL ENGINE V2.4 PRO</span>
            </div>
          </div>

          <!-- Main Content Area -->
          <div class="flex-1 flex flex-col bg-transparent overflow-hidden">
            <div class="flex-1 overflow-y-auto px-10 py-10 custom-scrollbar space-y-8">

              <!-- 1. 面板设置 (Panel Settings) -->
              <div v-if="activeTab === 'panel'" class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <h3 class="text-xs font-black uppercase tracking-widest text-slate-500 px-4 mb-4">节点与视觉 (Node & UI)</h3>
                
                <div class="space-y-2">
                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Monitor class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.node.name') || '节点名称' }}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Identify this instance</p>
                      </div>
                    </div>
                    <input v-model="serverPosition.name" type="text" @blur="$emit('syncNode')"
                      class="w-64 rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-all border text-right"
                      :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                  </div>

                  <div class="p-6 rounded-2xl border transition-colors duration-300 space-y-4"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><MapPin class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">节点位置</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Country / Region / City / Coordinates</p>
                      </div>
                    </div>
                    <div class="grid grid-cols-3 gap-3 pl-14">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">国家</label>
                        <input v-model="serverPosition.country" type="text" placeholder="中国" @blur="$emit('syncNode')"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border placeholder:font-normal"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white placeholder-slate-600 focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">省份</label>
                        <input v-model="serverPosition.region" type="text" placeholder="河南" @blur="$emit('syncNode')"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border placeholder:font-normal"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white placeholder-slate-600 focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">城市</label>
                        <input v-model="serverPosition.city" type="text" placeholder="郑州" @blur="$emit('syncNode')"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border placeholder:font-normal"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white placeholder-slate-600 focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pl-14">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">纬度 Lat</label>
                        <input v-model.number="serverPosition.lat" type="number" step="0.01" placeholder="34.75" @blur="$emit('syncNode')"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border placeholder:font-normal"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white placeholder-slate-600 focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">经度 Lon</label>
                        <input v-model.number="serverPosition.lon" type="number" step="0.01" placeholder="113.65" @blur="$emit('syncNode')"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border placeholder:font-normal"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white placeholder-slate-600 focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
                      </div>
                    </div>
                  </div>

                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Globe class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.node.ip_api') || '定位 API 源' }}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Data provider for IPs</p>
                      </div>
                    </div>
                    <div class="relative" ref="apiSelectRef">
                      <button @click="apiDropdownOpen = !apiDropdownOpen" type="button"
                        class="w-64 rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-all border text-right flex items-center justify-between gap-2"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white hover:border-indigo-500/30' : 'bg-white border-slate-200 text-slate-900 shadow-sm hover:border-indigo-500'">
                        <span>{{ (availableIpApis.find(a => a.id === securitySettings.activeIpApi)?.name || '').toUpperCase() }}</span>
                        <ChevronDown class="w-4 h-4 opacity-50 transition-transform" :class="apiDropdownOpen ? 'rotate-180' : ''" />
                      </button>
                      <transition enter-active-class="transition duration-150 ease-out" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-100 ease-in" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-1">
                        <div v-if="apiDropdownOpen"
                          class="absolute right-0 mt-2 w-64 rounded-xl border shadow-2xl overflow-hidden z-50"
                          :class="isDarkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'">
                          <button v-for="api in availableIpApis" :key="api.id" type="button"
                            @click="securitySettings.activeIpApi = api.id; $emit('savePartial', { activeIpApi: api.id }); apiDropdownOpen = false"
                            class="w-full px-4 py-2.5 text-sm font-bold text-right transition-colors flex items-center justify-between"
                            :class="[
                              securitySettings.activeIpApi === api.id
                                ? (isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
                                : (isDarkMode ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50')
                            ]">
                            <span>{{ api.name.toUpperCase() }}</span>
                            <Check v-if="securitySettings.activeIpApi === api.id" class="w-4 h-4 text-indigo-500" />
                          </button>
                        </div>
                      </transition>
                    </div>
                  </div>

                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><RefreshCw class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">自动定位节点</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Auto-detect server location</p>
                      </div>
                    </div>
                    <button @click="$emit('refreshNode')"
                      class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border active:scale-95"
                      :class="isDarkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'">
                      <RefreshCw class="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                      刷新定位
                    </button>
                  </div>

                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Languages class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.system.lang') || '系统语言' }}</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Interface language</p>
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button v-for="l in ['zh', 'en', 'ja', 'fr', 'de']" :key="l" @click="$emit('setLocale', l)"
                        class="px-3 py-2 rounded-lg text-[10px] font-black transition-all border uppercase"
                        :class="locale === l ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' : (isDarkMode ? 'bg-black/20 text-slate-500 border-white/5 hover:bg-white/10' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')">
                        {{ l }}
                      </button>
                    </div>
                  </div>

                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors duration-300"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-4">
                      <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><Activity class="w-5 h-5" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">显示实时轨迹</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">World map trajectory lines</p>
                      </div>
                    </div>
                    <button @click="securitySettings.showTrajectory = !securitySettings.showTrajectory"
                      class="w-12 h-6 rounded-full p-1 transition-all flex items-center shadow-inner"
                      :class="securitySettings.showTrajectory ? 'bg-indigo-500' : 'bg-slate-400'">
                      <div class="w-4 h-4 bg-white rounded-full transition-all transform"
                        :class="securitySettings.showTrajectory ? 'translate-x-6' : ''"></div>
                    </button>
                  </div>
                </div>

                <div class="pt-6 flex justify-end">
                  <button @click="$emit('saveNode')"
                    class="px-10 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all active:scale-95">
                    {{ $t('common.save') || '保存更改' }}
                  </button>
                </div>
              </div>

              <!-- 2. 安全配置 (Security Config) -->
              <div v-if="activeTab === 'api'" class="space-y-8 animate-in fade-in duration-300">
                <div class="p-10 rounded-[40px] border flex flex-col items-center text-center space-y-6 transition-all duration-300"
                  :class="isDarkMode ? 'bg-slate-950/40 border-white/5 shadow-2xl' : 'bg-slate-50 border-slate-200 shadow-sm'">
                  <div class="w-20 h-20 rounded-[28px] bg-indigo-500/10 flex items-center justify-center text-indigo-500 shadow-inner">
                    <ShieldCheck class="w-10 h-10" />
                  </div>
                  <div class="space-y-2">
                    <h4 class="text-2xl font-black tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">API 安全矩阵管理</h4>
                    <p class="text-xs text-slate-500 max-w-sm leading-relaxed font-bold uppercase tracking-wider">Configure System, Group, and API level security guard rules.</p>
                  </div>
                  <button @click="$emit('openSecurityConsole')"
                    class="px-10 py-5 rounded-[24px] bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-3">
                    <LayoutGrid class="w-5 h-5" /> 进入矩阵控制台
                  </button>
                </div>
              </div>

              <!-- 3. 防火墙配置 (Firewall Config) -->
              <div v-if="activeTab === 'firewall'" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

                <!-- ===== 区块 1：防护引擎总览 — 6 个开关卡片网格 ===== -->
                <div class="grid grid-cols-3 gap-3">
                  <div v-for="mod in defenseModules" :key="mod.key"
                    class="p-4 rounded-2xl border flex items-center justify-between transition-all cursor-pointer group"
                    :class="isDarkMode ? 'bg-white/5 border-white/5 hover:border-white/10' : 'bg-slate-50 border-slate-100 hover:border-slate-200 shadow-sm'"
                    @click="toggleSection(mod.key)">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" :class="mod.iconBg">
                        <component :is="mod.icon" class="w-4 h-4" :class="mod.iconColor" />
                      </div>
                      <div class="min-w-0">
                        <p class="text-xs font-bold truncate" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ mod.label }}</p>
                        <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate">{{ mod.sub }}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <input type="checkbox" v-model="securitySettings.defense[mod.key]" class="toggle-switch"
                        @click.stop
                        @change="onToggle(mod.key)">
                      <ChevronRight class="w-3.5 h-3.5 text-slate-500 transition-transform" :class="expandedSection === mod.key ? 'rotate-90' : ''" />
                    </div>
                  </div>
                </div>

                <!-- ===== 区块 2：策略参数配置 — 折叠面板 ===== -->
                <div class="space-y-2">
                  <!-- 速率限制参数 -->
                  <div v-if="expandedSection === 'enableRateLimit'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3 mb-4">
                      <Activity class="w-4 h-4 text-emerald-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">速率限制参数</span>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">最大请求数</label>
                        <input v-model.number="securitySettings.defense.rateLimitRequests" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">时间窗口 (秒)</label>
                        <input v-model.number="securitySettings.defense.rateLimitWindow" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                  </div>

                  <!-- Scanner 陷阱参数 -->
                  <div v-if="expandedSection === 'enableAutoBlacklist'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3 mb-4">
                      <Bug class="w-4 h-4 text-rose-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">Scanner 陷阱参数</span>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">触发次数</label>
                        <input v-model.number="securitySettings.defense.maxNotFoundAttempts" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">封禁时长 (秒)</label>
                        <input v-model.number="securitySettings.defense.blacklistDuration" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">检测窗口 (秒)</label>
                        <input v-model.number="securitySettings.defense.notFoundWindow" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                  </div>

                  <!-- 暴力破解参数 -->
                  <div v-if="expandedSection === 'enableBruteForce'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3 mb-4">
                      <Lock class="w-4 h-4 text-amber-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">暴力破解防护参数</span>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">单账号尝试上限</label>
                        <input v-model.number="securitySettings.defense.bruteLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">检测窗口 (秒)</label>
                        <input v-model.number="securitySettings.defense.bruteWindow" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">IP 总尝试上限</label>
                        <input v-model.number="securitySettings.defense.bruteIpLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">账号锁定时长 (秒)</label>
                        <input v-model.number="securitySettings.defense.accountLockTime" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">IP 封禁时长 (秒)</label>
                        <input v-model.number="securitySettings.defense.ipBlockTime" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                  </div>

                  <!-- 连接限制参数 -->
                  <div v-if="expandedSection === 'enableConnLimit'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3 mb-4">
                      <Wifi class="w-4 h-4 text-cyan-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">连接并发限制</span>
                    </div>
                    <div class="grid grid-cols-1 gap-4 max-w-xs">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">单 IP 最大连接数</label>
                        <input v-model.number="securitySettings.defense.maxConn" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                  </div>

                  <!-- 地理围栏参数 -->
                  <div v-if="expandedSection === 'enableGeoFilter'" class="p-5 rounded-2xl border animate-in fade-in duration-200 space-y-4"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3">
                      <Globe class="w-4 h-4 text-blue-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">地理围栏参数</span>
                    </div>
                    <div>
                      <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">敏感路径 (每行一个)</label>
                      <textarea v-model="sensitivePathsFormatted" rows="3"
                        class="w-full rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none transition-all border"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'"></textarea>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">海外请求上限</label>
                        <input v-model.number="securitySettings.defense.geoRules.overseasLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">检测窗口 (秒)</label>
                        <input v-model.number="securitySettings.defense.geoRules.overseasWindow" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">封禁时长 (秒)</label>
                        <input v-model.number="securitySettings.defense.geoRules.overseasBlockTime" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                  </div>

                  <!-- Bot 检测参数 -->
                  <div v-if="expandedSection === 'enableBotChallenge'" class="p-5 rounded-2xl border animate-in fade-in duration-200 space-y-4"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                    <div class="flex items-center gap-3">
                      <Shield class="w-4 h-4 text-violet-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">Bot 检测参数</span>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">无 UA 触发阈值</label>
                        <input v-model.number="securitySettings.defense.botChallengeNoUaLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Bot UA 触发阈值</label>
                        <input v-model.number="securitySettings.defense.botChallengeBotLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">浏览器异常阈值</label>
                        <input v-model.number="securitySettings.defense.botChallengeBrowserLimit" type="number"
                          class="w-full rounded-xl px-3 py-2 text-sm font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">Bot UA 关键词 (每行一个)</label>
                        <textarea v-model="botPatternsFormatted" rows="4"
                          class="w-full rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'"></textarea>
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest mb-1.5 block" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">浏览器 UA 关键词 (每行一个)</label>
                        <textarea v-model="browserPatternsFormatted" rows="4"
                          class="w-full rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none transition-all border"
                          :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'"></textarea>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ===== 区块 3：网络信任列表 — 标签输入 ===== -->
                <div class="p-6 rounded-2xl border transition-colors duration-300"
                  :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                  <div class="flex items-center gap-3 mb-5">
                    <Database class="w-4 h-4 text-indigo-500" />
                    <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">网络信任列表</span>
                  </div>
                  <div class="space-y-5">
                    <!-- 受信任内网前缀 -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-[10px] font-bold uppercase tracking-widest" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">受信任内网前缀</label>
                        <span class="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">IPv4/CIDR</span>
                      </div>
                      <div class="flex flex-wrap gap-1.5 p-3 rounded-xl border min-h-[40px]"
                        :class="isDarkMode ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'">
                        <span v-for="(ip, i) in securitySettings.defense.internalIpPrefixes" :key="i"
                          class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
                          :class="isDarkMode ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'">
                          {{ ip }}
                          <X class="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100" @click="removeTag('internalIpPrefixes', i)" />
                        </span>
                        <input placeholder="输入后回车添加..." @keydown.enter.prevent="addTag('internalIpPrefixes', $event)"
                          class="flex-1 min-w-[120px] bg-transparent text-xs font-bold outline-none"
                          :class="isDarkMode ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'">
                      </div>
                    </div>
                    <!-- IDC 前缀 -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-[10px] font-bold uppercase tracking-widest" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">IDC 数据中心前缀</label>
                        <span class="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">Cloud/IDC</span>
                      </div>
                      <div class="flex flex-wrap gap-1.5 p-3 rounded-xl border min-h-[40px]"
                        :class="isDarkMode ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'">
                        <span v-for="(ip, i) in securitySettings.defense.idcIpPrefixes" :key="i"
                          class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
                          :class="isDarkMode ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-50 text-rose-600'">
                          {{ ip }}
                          <X class="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100" @click="removeTag('idcIpPrefixes', i)" />
                        </span>
                        <input placeholder="输入后回车添加..." @keydown.enter.prevent="addTag('idcIpPrefixes', $event)"
                          class="flex-1 min-w-[120px] bg-transparent text-xs font-bold outline-none"
                          :class="isDarkMode ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'">
                      </div>
                    </div>
                    <!-- 安全路径 -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-[10px] font-bold uppercase tracking-widest" :class="isDarkMode ? 'text-slate-500' : 'text-slate-400'">安全路径白名单</label>
                        <span class="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">Paths</span>
                      </div>
                      <div class="flex flex-wrap gap-1.5 p-3 rounded-xl border min-h-[40px]"
                        :class="isDarkMode ? 'bg-black/40 border-white/10' : 'bg-white border-slate-200'">
                        <span v-for="(p, i) in securitySettings.defense.safePaths" :key="i"
                          class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold"
                          :class="isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'">
                          {{ p }}
                          <X class="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100" @click="removeTag('safePaths', i)" />
                        </span>
                        <input placeholder="输入后回车添加..." @keydown.enter.prevent="addTag('safePaths', $event)"
                          class="flex-1 min-w-[120px] bg-transparent text-xs font-bold outline-none"
                          :class="isDarkMode ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'">
                      </div>
                    </div>
                  </div>
                  <div class="mt-4 flex justify-end">
                    <button @click="$emit('savePartial', { internalIpPrefixes: securitySettings.defense.internalIpPrefixes, idcIpPrefixes: securitySettings.defense.idcIpPrefixes, safePaths: securitySettings.defense.safePaths })"
                      class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all active:scale-95">
                      保存信任列表
                    </button>
                  </div>
                </div>

                <!-- ===== 区块 4：底部操作 ===== -->
                <div class="pt-2 flex justify-end">
                  <button @click="$emit('saveSecurity')"
                    class="px-12 py-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-cyan-600/30 transition-all active:scale-95">
                    {{ $t('settings.defense.deploy') || '应用防护策略' }}
                  </button>
                </div>
              </div>

              <!-- 4. 其他设置 (Other Settings) -->
              <div v-if="activeTab === 'others'" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <!-- 快捷操作 -->
                <div class="grid grid-cols-1 gap-3">
                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors group"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
                    <div class="flex items-center gap-4">
                      <div class="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 transition-transform group-hover:rotate-12"><RefreshCw class="w-6 h-6" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">全量数据同步</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Reload all config pools</p>
                      </div>
                    </div>
                    <button @click="$emit('fetchData')" class="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest transition-all">执行同步</button>
                  </div>

                  <div class="p-6 rounded-2xl border flex items-center justify-between transition-colors group"
                    :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
                    <div class="flex items-center gap-4">
                      <div class="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 transition-transform group-hover:rotate-12"><Trash2 class="w-6 h-6" /></div>
                      <div>
                        <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">审计记录重置</p>
                        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Clear logs & metrics</p>
                      </div>
                    </div>
                    <button @click="$emit('resetStats')" class="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest transition-all">执行重置</button>
                  </div>
                </div>

                <!-- 封禁管理 -->
                <div class="p-8 rounded-3xl border transition-colors duration-300"
                  :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
                  <div class="flex items-center justify-between border-b pb-6 mb-6" :class="isDarkMode ? 'border-white/5' : 'border-slate-200'">
                    <div class="flex items-center gap-3">
                      <ShieldAlert class="w-5 h-5 text-rose-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">活跃封禁管理</span>
                      <span class="text-[9px] font-black px-2 py-0.5 rounded-full" :class="isDarkMode ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-100 text-rose-600'">{{ activeBlocks.length }}</span>
                    </div>
                    <button @click="$emit('fetchBlocks')" class="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors" :class="isDarkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'">刷新</button>
                  </div>

                  <!-- 添加封禁表单 -->
                  <div class="flex gap-4 items-end mb-6">
                    <div class="flex-1">
                      <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">IP 地址</label>
                      <input v-model="newBlockIp" type="text" placeholder="192.168.1.1"
                        class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none transition-all border"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                    </div>
                    <div class="w-32">
                      <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">时长(秒)</label>
                      <input v-model.number="newBlockDuration" type="number" :disabled="newBlockPermanent" placeholder="86400"
                        class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                        :class="[isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500', newBlockPermanent ? 'opacity-40' : '']">
                    </div>
                    <div class="w-28">
                      <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">状态</label>
                      <select v-model="newBlockStatus"
                        class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border appearance-none"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'">
                        <option value="BLOCKED">BLOCKED</option>
                        <option value="SCANNER">SCANNER</option>
                        <option value="CHALLENGE">CHALLENGE</option>
                      </select>
                    </div>
                    <button @click="newBlockPermanent = !newBlockPermanent"
                      class="px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all"
                      :class="newBlockPermanent ? 'bg-rose-600 text-white border-rose-500' : (isDarkMode ? 'bg-black/20 text-slate-400 border-white/10 hover:bg-white/5' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')">
                      {{ newBlockPermanent ? '永久' : '临时' }}
                    </button>
                    <button @click="handleAddBlock"
                      class="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all active:scale-95">
                      <Plus class="w-4 h-4" />
                    </button>
                  </div>

                  <!-- 封禁列表 -->
                  <div class="border rounded-2xl overflow-hidden transition-all duration-300"
                    :class="isDarkMode ? 'border-white/5 bg-black/10' : 'border-slate-200 bg-white shadow-sm'">
                    <div class="flex items-center px-6 py-3 border-b transition-colors"
                      :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50/80 border-slate-100'">
                      <div class="flex-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">IP</div>
                      <div class="w-24 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">状态</div>
                      <div class="w-20 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">来源</div>
                      <div class="w-28 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">过期</div>
                      <div class="w-20 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">操作</div>
                    </div>
                    <div class="divide-y transition-colors max-h-64 overflow-y-auto custom-scrollbar" :class="isDarkMode ? 'divide-white/5' : 'divide-slate-100'">
                      <div v-for="block in activeBlocks" :key="block.ip"
                        class="flex items-center px-6 py-3 hover:bg-indigo-500/5 transition-colors">
                        <div class="flex-1 font-mono text-xs font-bold" :class="isDarkMode ? 'text-emerald-400' : 'text-emerald-600'">{{ block.ip }}</div>
                        <div class="w-24 text-center">
                          <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md"
                            :class="block.status === 'SCANNER' ? 'bg-rose-500/10 text-rose-400' : block.status === 'CHALLENGE' ? 'bg-amber-500/10 text-amber-400' : (isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')">
                            {{ block.status }}
                          </span>
                        </div>
                        <div class="w-20 text-center">
                          <span class="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md"
                            :class="block.source === 'manual' ? 'bg-indigo-500/10 text-indigo-400' : (isDarkMode ? 'bg-white/5 text-slate-500' : 'bg-slate-50 text-slate-400')">
                            {{ block.source === 'manual' ? '手动' : '自动' }}
                          </span>
                        </div>
                        <div class="w-28 text-center">
                          <span v-if="block.permanent" class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400">永久</span>
                          <span v-else class="text-[10px] font-bold" :class="isDarkMode ? 'text-slate-400' : 'text-slate-500'">{{ formatRemaining(block.remainingSeconds) }}</span>
                        </div>
                        <div class="w-20 text-right">
                          <button @click="$emit('removeBlock', block.ip)"
                            class="text-[10px] font-black uppercase tracking-tighter transition-colors"
                            :class="isDarkMode ? 'text-rose-500/80 hover:text-rose-400' : 'text-rose-600 hover:text-rose-500'">
                            解封
                          </button>
                        </div>
                      </div>
                      <div v-if="!activeBlocks.length" class="px-6 py-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        暂无活跃封禁
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 白名单管理 -->
                <div class="p-8 rounded-3xl border transition-colors duration-300"
                  :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
                  <div class="flex items-center justify-between border-b pb-6 mb-6" :class="isDarkMode ? 'border-white/5' : 'border-slate-200'">
                    <div class="flex items-center gap-3">
                      <ShieldCheck class="w-5 h-5 text-emerald-500" />
                      <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">临时白名单管理</span>
                      <span class="text-[9px] font-black px-2 py-0.5 rounded-full" :class="isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-600'">{{ activeWhitelist.length }}</span>
                    </div>
                    <button @click="$emit('fetchWhitelist')" class="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors" :class="isDarkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'">刷新</button>
                  </div>

                  <!-- 添加白名单表单 -->
                  <div class="flex gap-4 items-end mb-6">
                    <div class="flex-1">
                      <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">IP 地址</label>
                      <input v-model="newWlIp" type="text" placeholder="192.168.1.1"
                        class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none transition-all border"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-emerald-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-emerald-500'">
                    </div>
                    <div class="w-40">
                      <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">白名单时长(秒)</label>
                      <input v-model.number="newWlDuration" type="number" placeholder="1200"
                        class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                        :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-emerald-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-emerald-500'">
                    </div>
                    <button @click="handleAddWhitelist"
                      class="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all active:scale-95">
                      <Plus class="w-4 h-4" />
                    </button>
                  </div>

                  <!-- 白名单列表 -->
                  <div class="border rounded-2xl overflow-hidden transition-all duration-300"
                    :class="isDarkMode ? 'border-white/5 bg-black/10' : 'border-slate-200 bg-white shadow-sm'">
                    <div class="flex items-center px-6 py-3 border-b transition-colors"
                      :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50/80 border-slate-100'">
                      <div class="flex-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">IP</div>
                      <div class="w-36 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">剩余时间</div>
                      <div class="w-20 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">操作</div>
                    </div>
                    <div class="divide-y transition-colors max-h-48 overflow-y-auto custom-scrollbar" :class="isDarkMode ? 'divide-white/5' : 'divide-slate-100'">
                      <div v-for="wl in activeWhitelist" :key="wl.ip"
                        class="flex items-center px-6 py-3 hover:bg-emerald-500/5 transition-colors">
                        <div class="flex-1 font-mono text-xs font-bold" :class="isDarkMode ? 'text-emerald-400' : 'text-emerald-600'">{{ wl.ip }}</div>
                        <div class="w-36 text-center">
                          <span class="text-[10px] font-bold" :class="isDarkMode ? 'text-slate-400' : 'text-slate-500'">{{ formatRemaining(wl.remainingSeconds) }}</span>
                        </div>
                        <div class="w-20 text-right">
                          <button @click="$emit('removeWhitelist', wl.ip)"
                            class="text-[10px] font-black uppercase tracking-tighter transition-colors"
                            :class="isDarkMode ? 'text-rose-500/80 hover:text-rose-400' : 'text-rose-600 hover:text-rose-500'">
                            移除
                          </button>
                        </div>
                      </div>
                      <div v-if="!activeWhitelist.length" class="px-6 py-8 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        暂无活跃白名单
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  X, Settings, Layout, ShieldCheck, ShieldAlert, Cpu,
  MapPin, Activity, RefreshCw, Sun, Moon, Trash2,
  Database, LayoutGrid, ChevronRight, ChevronDown, Plus, Monitor, Lock, Globe, Languages, Bug, Check, Wifi, Shield
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: Boolean,
  isDarkMode: Boolean,
  serverPosition: Object,
  securitySettings: Object,
  configs: Object,
  summary: Object,
  loading: Boolean,
  availableIpApis: Array,
  activeBlocks: { type: Array, default: () => [] },
  activeWhitelist: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'saveNode', 'syncNode', 'refreshNode', 'openSecurityConsole', 'openDefense', 'setLocale', 'setTheme', 'fetchData', 'resetStats', 'addBlacklist', 'removeBlacklist', 'saveSecurity', 'savePartial', 'addBlock', 'removeBlock', 'fetchBlocks', 'addWhitelist', 'removeWhitelist', 'fetchWhitelist', 'tagAdd', 'tagRemove'])

const { locale } = useI18n()
const activeTab = ref('panel')
const apiDropdownOpen = ref(false)
const apiSelectRef = ref(null)

const handleApiClickOutside = (e) => {
  if (apiSelectRef.value && !apiSelectRef.value.contains(e.target)) {
    apiDropdownOpen.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', handleApiClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleApiClickOutside))

const tabs = [
  { id: 'panel', label: '面板设置', icon: Layout },
  { id: 'api', label: '安全配置', icon: ShieldCheck },
  { id: 'firewall', label: '防火墙配置', icon: ShieldAlert },
  { id: 'others', label: '其他设置', icon: Settings }
]

const currentTabLabel = computed(() => tabs.find(t => t.id === activeTab.value)?.label || '')
const newBlacklistType = ref('ip')
const newBlacklistValue = ref('')

// 封禁管理表单
const newBlockIp = ref('')
const newBlockDuration = ref(86400)
const newBlockPermanent = ref(true)
const newBlockStatus = ref('BLOCKED')

// 白名单管理表单
const newWlIp = ref('')
const newWlDuration = ref(1200)

// 格式化剩余时间
function formatRemaining(seconds) {
  if (seconds == null) return '永久'
  if (seconds <= 0) return '已过期'
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}时${m}分`
}

// Bot 检测 patterns 格式化
const botPatternsFormatted = computed({
  get: () => {
    const val = props.securitySettings?.defense?.botPatterns
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (props.securitySettings?.defense) {
      props.securitySettings.defense.botPatterns = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

const browserPatternsFormatted = computed({
  get: () => {
    const val = props.securitySettings?.defense?.browserPatterns
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (props.securitySettings?.defense) {
      props.securitySettings.defense.browserPatterns = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

// 地理围栏敏感路径格式化
const sensitivePathsFormatted = computed({
  get: () => {
    const val = props.securitySettings?.defense?.geoRules?.sensitivePaths
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (props.securitySettings?.defense?.geoRules) {
      props.securitySettings.defense.geoRules.sensitivePaths = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

// 折叠面板控制
const expandedSection = ref(null)
const toggleSection = (key) => {
  expandedSection.value = expandedSection.value === key ? null : key
}

// 单个配置项变更时自动保存
const onToggle = (key) => {
  emit('savePartial', { [key]: props.securitySettings.defense[key] })
}

// 6 个防护模块定义
const defenseModules = [
  { key: 'enableRateLimit', label: '速率限制', sub: 'Rate Limit', icon: Activity, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
  { key: 'enableAutoBlacklist', label: 'Scanner 陷阱', sub: 'Auto Block', icon: Bug, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-500' },
  { key: 'enableBruteForce', label: '暴力破解防护', sub: 'Brute Force', icon: Lock, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500' },
  { key: 'enableConnLimit', label: '连接并发限制', sub: 'Conn Limit', icon: Wifi, iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-500' },
  { key: 'enableGeoFilter', label: '地理围栏', sub: 'Geo Filter', icon: Globe, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500' },
  { key: 'enableBotChallenge', label: 'Bot 检测', sub: 'Bot Detect', icon: Shield, iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500' },
]

// 标签输入：回车添加
const addTag = (field, event) => {
  const val = event.target.value.trim()
  if (!val) return
  emit('tagAdd', { field, value: val })
  event.target.value = ''
}

// 标签输入：删除
const removeTag = (field, index) => {
  emit('tagRemove', { field, index })
}

const handleAddBlacklist = () => {
  if (!newBlacklistValue.value) return
  // 支持批量拆分录入
  const targets = newBlacklistValue.value.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0)
    
  targets.forEach(target => {
    emit('addBlacklist', newBlacklistType.value, target)
  })
  
  newBlacklistValue.value = ''
}
const handleRemoveBlacklist = (type, value) => emit('removeBlacklist', type, value)

const handleAddBlock = () => {
  if (!newBlockIp.value) return
  emit('addBlock', {
    ip: newBlockIp.value,
    permanent: newBlockPermanent.value,
    duration: newBlockPermanent.value ? undefined : newBlockDuration.value,
    status: newBlockStatus.value
  })
  newBlockIp.value = ''
}

const handleAddWhitelist = () => {
  if (!newWlIp.value) return
  emit('addWhitelist', {
    ip: newWlIp.value,
    duration: newWlDuration.value || 1200
  })
  newWlIp.value = ''
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.2); border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.4); }

.toggle-switch {
  appearance: none;
  width: 2.4rem;
  height: 1.2rem;
  background: #334155;
  border-radius: 9999px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}
.toggle-switch:checked { background: #10b981; }
.toggle-switch::before {
  content: "";
  position: absolute;
  width: 0.9rem;
  height: 0.9rem;
  background: white;
  border-radius: 50%;
  top: 0.15rem;
  left: 0.15rem;
  transition: transform 0.3s;
}
.toggle-switch:checked::before { transform: translateX(1.2rem); }

input[type="number"]::-webkit-inner-spin-button, 
input[type="number"]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}
</style>
