<template>
  <BaseModal :model-value="isOpen" @update:model-value="$emit('close')" :is-dark="isDarkMode"
    backdrop-class="bg-black/30 backdrop-blur-md" z-index="z-[3000]">

    <template #header>
      <div class="flex items-center gap-3">
        <Settings class="w-6 h-6 text-indigo-500" />
        <h2 class="text-lg font-bold tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">
          {{ $t('settings.title') }} <span class="text-indigo-500 opacity-40 mx-1">/</span> {{ currentTabLabel }}
        </h2>
      </div>
    </template>

    <template #header-actions>
      <div class="flex items-center gap-2 px-3 py-1 rounded-full border transition-colors duration-500"
        :class="isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'">
        <StatusPing color="indigo" />
        <span class="text-[9px] font-black uppercase tracking-widest text-indigo-500">{{ $t('common.system_ready') }}</span>
      </div>
    </template>

    <div class="flex-1 flex overflow-hidden h-full">
      <!-- Sidebar Navigation -->
      <div class="w-72 flex flex-col border-r transition-colors shrink-0"
        :class="isDarkMode ? 'bg-slate-950/20 border-white/5' : 'bg-slate-50/30 border-slate-100'">
        <nav class="flex-1 px-4 py-8 space-y-1.5">
          <NavItem v-for="tab in tabs" :key="tab.id"
            :is-active="activeTab === tab.id"
            :icon="tab.icon"
            :label="tab.label"
            :is-dark="isDarkMode"
            variant="indigo"
            @click="activeTab = tab.id" />
        </nav>

        <div class="p-8 border-t border-white/5 bg-black/10">
          <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Build Version</p>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FIREWALL ENGINE V2.4 PRO</span>
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col bg-transparent overflow-hidden h-full">
        <div class="flex-1 overflow-y-auto px-10 py-10 custom-scrollbar space-y-8 h-full">

          <!-- 1. Panel Settings -->
          <div v-if="activeTab === 'panel'" class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 class="text-xs font-black uppercase tracking-widest text-slate-500 px-4 mb-4">{{ $t('settings.panel.node_ui') }}</h3>

            <div class="space-y-2">
              <SettingRow :is-dark="isDarkMode" :icon="Monitor" :title="$t('settings.node.name') || '节点名称'"
                description="Identify this instance">
                <input v-model="serverPosition.name" type="text" @blur="handleSyncNode"
                  class="w-64 rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-all border text-right"
                  :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'">
              </SettingRow>

              <div class="p-6 rounded-2xl border transition-colors duration-300 space-y-4"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500"><MapPin class="w-5 h-5" /></div>
                  <div>
                    <p class="text-sm font-bold" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.panel.node_location') }}</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{{ $t('settings.panel.node_location_desc') }}</p>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-3 pl-14">
                  <FormField v-model="serverPosition.country" :label="$t('settings.panel.country')" :is-dark="isDarkMode" placeholder="China" @blur="handleSyncNode" />
                  <FormField v-model="serverPosition.region" :label="$t('settings.panel.region')" :is-dark="isDarkMode" placeholder="Henan" @blur="handleSyncNode" />
                  <FormField v-model="serverPosition.city" :label="$t('settings.panel.city')" :is-dark="isDarkMode" placeholder="Zhengzhou" @blur="handleSyncNode" />
                </div>
                <div class="grid grid-cols-2 gap-3 pl-14">
                  <FormField v-model.number="serverPosition.lat" :label="$t('settings.panel.latitude')" type="number" step="0.01" :is-dark="isDarkMode" placeholder="34.75" @blur="handleSyncNode" />
                  <FormField v-model.number="serverPosition.lon" :label="$t('settings.panel.longitude')" type="number" step="0.01" :is-dark="isDarkMode" placeholder="113.65" @blur="handleSyncNode" />
                </div>
              </div>

              <SettingRow :is-dark="isDarkMode" :icon="Globe" :title="$t('settings.node.ip_api') || '定位 API 源'"
                description="Data provider for IPs">
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
                        @click="securitySettings.activeIpApi = api.id; handleSavePartial({ activeIpApi: api.id }); apiDropdownOpen = false"
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
              </SettingRow>

              <SettingRow :is-dark="isDarkMode" :icon="RefreshCw" :title="$t('settings.panel.auto_detect')"
                :description="$t('settings.panel.auto_detect_desc')" icon-bg="bg-emerald-500/10" icon-color="text-emerald-500">
                <button @click="handleRefreshNode()"
                  class="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border active:scale-95"
                  :class="isDarkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'">
                  <RefreshCw class="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                  {{ $t('settings.panel.refresh_location') }}
                </button>
              </SettingRow>

              <SettingRow :is-dark="isDarkMode" :icon="Languages" :title="$t('settings.system.lang') || '系统语言'"
                description="Interface language">
                <div class="flex gap-2">
                  <button v-for="l in ['zh', 'en', 'ja', 'fr', 'de']" :key="l" @click="uiStore.setLocale(l)"
                    class="px-3 py-2 rounded-lg text-[10px] font-black transition-all border uppercase"
                    :class="locale === l ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' : (isDarkMode ? 'bg-black/20 text-slate-500 border-white/5 hover:bg-white/10' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')">
                    {{ l }}
                  </button>
                </div>
              </SettingRow>

              <SettingRow :is-dark="isDarkMode" :icon="Activity" :title="$t('settings.panel.show_trajectory')"
                :description="$t('settings.panel.show_trajectory_desc')">
                <ToggleSwitch v-model="securitySettings.showTrajectory" />
              </SettingRow>
            </div>

            <div class="pt-6 flex justify-end">
              <PrimaryButton @click="handleSaveNode()" variant="indigo">
                {{ $t('common.save') || '保存更改' }}
              </PrimaryButton>
            </div>
          </div>

          <!-- 2. Security Config -->
          <div v-if="activeTab === 'api'" class="space-y-8 animate-in fade-in duration-300">
            <div class="p-10 rounded-[40px] border flex flex-col items-center text-center space-y-6 transition-all duration-300"
              :class="isDarkMode ? 'bg-slate-950/40 border-white/5 shadow-2xl' : 'bg-slate-50 border-slate-200 shadow-sm'">
              <div class="w-20 h-20 rounded-[28px] bg-indigo-500/10 flex items-center justify-center text-indigo-500 shadow-inner">
                <ShieldCheck class="w-10 h-10" />
              </div>
              <div class="space-y-2">
                <h4 class="text-2xl font-black tracking-tight" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.panel.api_matrix') }}</h4>
                <p class="text-xs text-slate-500 max-w-sm leading-relaxed font-bold uppercase tracking-wider">{{ $t('settings.panel.api_matrix_desc') }}</p>
              </div>
              <PrimaryButton @click="defenseStore.isConfigModalOpen = true" variant="indigo" size="lg">
                <LayoutGrid class="w-5 h-5" /> {{ $t('settings.panel.enter_matrix') }}
              </PrimaryButton>
            </div>
          </div>

          <!-- 3. Firewall Config -->
          <div v-if="activeTab === 'firewall'" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <!-- Defense modules grid -->
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
                    @click.stop @change="onToggle(mod.key)">
                  <ChevronRight class="w-3.5 h-3.5 text-slate-500 transition-transform" :class="expandedSection === mod.key ? 'rotate-90' : ''" />
                </div>
              </div>
            </div>

            <!-- Collapsible parameter panels -->
            <div class="space-y-2">
              <div v-if="expandedSection === 'enableRateLimit'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3 mb-4">
                  <Activity class="w-4 h-4 text-emerald-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.rate_limit_title') }}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <FormField v-model.number="securitySettings.defense.rateLimitRequests" :label="$t('settings.firewall.max_requests')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.rateLimitWindow" :label="$t('settings.firewall.time_window')" type="number" :is-dark="isDarkMode" />
                </div>
              </div>

              <div v-if="expandedSection === 'enableAutoBlacklist'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3 mb-4">
                  <Bug class="w-4 h-4 text-rose-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.scanner_title') }}</span>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <FormField v-model.number="securitySettings.defense.maxNotFoundAttempts" :label="$t('settings.firewall.trigger_count')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.blacklistDuration" :label="$t('settings.firewall.block_duration')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.notFoundWindow" :label="$t('settings.firewall.detect_window')" type="number" :is-dark="isDarkMode" />
                </div>
              </div>

              <div v-if="expandedSection === 'enableBruteForce'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3 mb-4">
                  <Lock class="w-4 h-4 text-amber-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.brute_title') }}</span>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <FormField v-model.number="securitySettings.defense.bruteLimit" :label="$t('settings.firewall.account_limit')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.bruteWindow" :label="$t('settings.firewall.detect_window')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.bruteIpLimit" :label="$t('settings.firewall.ip_limit')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.accountLockTime" :label="$t('settings.firewall.account_lock')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.ipBlockTime" :label="$t('settings.firewall.ip_block')" type="number" :is-dark="isDarkMode" />
                </div>
              </div>

              <div v-if="expandedSection === 'enableConnLimit'" class="p-5 rounded-2xl border animate-in fade-in duration-200"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3 mb-4">
                  <Wifi class="w-4 h-4 text-cyan-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.conn_title') }}</span>
                </div>
                <div class="grid grid-cols-1 gap-4 max-w-xs">
                  <FormField v-model.number="securitySettings.defense.maxConn" :label="$t('settings.firewall.max_conn')" type="number" :is-dark="isDarkMode" />
                </div>
              </div>

              <div v-if="expandedSection === 'enableGeoFilter'" class="p-5 rounded-2xl border animate-in fade-in duration-200 space-y-4"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3">
                  <Globe class="w-4 h-4 text-blue-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.geo_title') }}</span>
                </div>
                <FormField v-model="sensitivePathsFormatted" type="textarea" :label="$t('settings.firewall.sensitive_paths')" :is-dark="isDarkMode" variant="mono" :rows="3" />
                <div class="grid grid-cols-3 gap-4">
                  <FormField v-model.number="securitySettings.defense.geoRules.overseasLimit" :label="$t('settings.firewall.overseas_limit')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.geoRules.overseasWindow" :label="$t('settings.firewall.overseas_window')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.geoRules.overseasBlockTime" :label="$t('settings.firewall.overseas_block')" type="number" :is-dark="isDarkMode" />
                </div>
              </div>

              <div v-if="expandedSection === 'enableBotChallenge'" class="p-5 rounded-2xl border animate-in fade-in duration-200 space-y-4"
                :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
                <div class="flex items-center gap-3">
                  <Shield class="w-4 h-4 text-violet-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.bot_title') }}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <FormField v-model.number="securitySettings.defense.botChallengeNoUaLimit" :label="$t('settings.firewall.no_ua_threshold')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.botChallengeBotLimit" :label="$t('settings.firewall.bot_ua_threshold')" type="number" :is-dark="isDarkMode" />
                  <FormField v-model.number="securitySettings.defense.botChallengeBrowserLimit" :label="$t('settings.firewall.browser_threshold')" type="number" :is-dark="isDarkMode" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <FormField v-model="botPatternsFormatted" type="textarea" :label="$t('settings.firewall.bot_ua_keywords')" :is-dark="isDarkMode" variant="mono" :rows="4" />
                  <FormField v-model="browserPatternsFormatted" type="textarea" :label="$t('settings.firewall.browser_ua_keywords')" :is-dark="isDarkMode" variant="mono" :rows="4" />
                </div>
              </div>
            </div>

            <!-- Network trust lists -->
            <div class="p-6 rounded-2xl border transition-colors duration-300"
              :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'">
              <div class="flex items-center gap-3 mb-5">
                <Database class="w-4 h-4 text-indigo-500" />
                <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.firewall.trust_list') }}</span>
              </div>
              <div class="space-y-5">
                <TagInput v-model="securitySettings.defense.internalIpPrefixes" :label="$t('settings.firewall.internal_prefix')"
                  badge="IPv4/CIDR" :is-dark="isDarkMode" color="indigo"
                  @add="val => handleTagAdd({ field: 'internalIpPrefixes', value: val })"
                  @remove="i => handleTagRemove({ field: 'internalIpPrefixes', index: i })" />
                <TagInput v-model="securitySettings.defense.idcIpPrefixes" :label="$t('settings.firewall.idc_prefix')"
                  badge="Cloud/IDC" :is-dark="isDarkMode" color="rose"
                  @add="val => handleTagAdd({ field: 'idcIpPrefixes', value: val })"
                  @remove="i => handleTagRemove({ field: 'idcIpPrefixes', index: i })" />
                <TagInput v-model="securitySettings.defense.safePaths" :label="$t('settings.firewall.safe_paths')"
                  badge="Paths" :is-dark="isDarkMode" color="emerald"
                  @add="val => handleTagAdd({ field: 'safePaths', value: val })"
                  @remove="i => handleTagRemove({ field: 'safePaths', index: i })" />
              </div>
              <div class="mt-4 flex justify-end">
                <PrimaryButton @click="handleSavePartial({ internalIpPrefixes: securitySettings.defense.internalIpPrefixes, idcIpPrefixes: securitySettings.defense.idcIpPrefixes, safePaths: securitySettings.defense.safePaths })"
                  variant="indigo" size="sm">
                  {{ $t('settings.firewall.save_trust') }}
                </PrimaryButton>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <PrimaryButton @click="handleSaveSecurity()" variant="cyan" size="lg">
                {{ $t('settings.defense.deploy') || '应用防护策略' }}
              </PrimaryButton>
            </div>
          </div>

          <!-- 4. Other Settings -->
          <div v-if="activeTab === 'others'" class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div class="grid grid-cols-1 gap-3">
              <SettingRow :is-dark="isDarkMode" :icon="RefreshCw" :title="$t('settings.others.full_sync')"
                :description="$t('settings.others.full_sync_desc')" icon-bg="bg-emerald-500/10" icon-color="text-emerald-400">
                <PrimaryButton @click="handleFetchData()" variant="emerald" size="sm">{{ $t('settings.others.execute_sync') }}</PrimaryButton>
              </SettingRow>

              <SettingRow :is-dark="isDarkMode" :icon="Trash2" :title="$t('settings.others.audit_reset')"
                :description="$t('settings.others.audit_reset_desc')" icon-bg="bg-rose-500/10" icon-color="text-rose-500">
                <PrimaryButton @click="handleResetStats()" variant="rose" size="sm">{{ $t('settings.others.execute_reset') }}</PrimaryButton>
              </SettingRow>
            </div>

            <!-- Block management -->
            <div class="p-8 rounded-3xl border transition-colors duration-300"
              :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
              <div class="flex items-center justify-between border-b pb-6 mb-6" :class="isDarkMode ? 'border-white/5' : 'border-slate-200'">
                <div class="flex items-center gap-3">
                  <ShieldAlert class="w-5 h-5 text-rose-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.others.ban_management') }}</span>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full" :class="isDarkMode ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-100 text-rose-600'">{{ activeBlocks.length }}</span>
                </div>
                <button @click="defenseStore.fetchBlocks()" class="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors" :class="isDarkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'">{{ $t('common.refresh') }}</button>
              </div>

              <!-- Add block form -->
              <div class="flex gap-4 items-end mb-6">
                <div class="w-28">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">Type</label>
                  <select v-model="newBlockType"
                    class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border appearance-none"
                    :class="isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'">
                    <option value="ip">IP</option>
                    <option value="fingerprint">FP</option>
                  </select>
                </div>
                <div class="flex-1">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">{{ newBlockType === 'fingerprint' ? 'Fingerprint' : $t('settings.others.ip_address') }}</label>
                  <input v-model="newBlockIp" type="text" :placeholder="newBlockType === 'fingerprint' ? 'a1b2c3d4e5f6...' : '192.168.1.1'"
                    class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none transition-all border"
                    :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500'">
                </div>
                <div class="w-32">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">{{ $t('settings.others.duration_sec') }}</label>
                  <input v-model.number="newBlockDuration" type="number" :disabled="newBlockPermanent" placeholder="86400"
                    class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                    :class="[isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-indigo-500', newBlockPermanent ? 'opacity-40' : '']">
                </div>
                <div class="w-28">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">{{ $t('common.status') }}</label>
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
                  {{ newBlockPermanent ? $t('common.permanent') : $t('common.automatic') }}
                </button>
                <PrimaryButton @click="handleAddBlock" variant="rose" size="sm">
                  <Plus class="w-4 h-4" />
                </PrimaryButton>
              </div>

              <!-- Block list -->
              <DataTable :is-dark="isDarkMode" :columns="blockColumns" :data="activeBlocks" :empty-message="$t('settings.others.no_active_bans')">
                <template #cell-target="{ row }">
                  <span class="font-mono text-xs font-bold" :class="isDarkMode ? 'text-emerald-400' : 'text-emerald-600'">{{ row.type === 'fingerprint' ? row.fingerprint : row.ip }}</span>
                </template>
                <template #cell-type="{ row }">
                  <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md"
                    :class="row.type === 'fingerprint' ? 'bg-violet-500/10 text-violet-400' : (isDarkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-100 text-cyan-600')">
                    {{ row.type === 'fingerprint' ? 'FP' : 'IP' }}
                  </span>
                </template>
                <template #cell-status="{ row }">
                  <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md"
                    :class="row.status === 'SCANNER' ? 'bg-rose-500/10 text-rose-400' : row.status === 'CHALLENGE' ? 'bg-amber-500/10 text-amber-400' : (isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')">
                    {{ row.status }}
                  </span>
                </template>
                <template #cell-expire="{ row }">
                  <span v-if="row.permanent" class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400">{{ $t('common.permanent') }}</span>
                  <span v-else class="text-[10px] font-bold" :class="isDarkMode ? 'text-slate-400' : 'text-slate-500'">{{ formatRemaining(row.remainingSeconds) }}</span>
                </template>
                <template #cell-action="{ row }">
                  <button @click="handleRemoveBlock({ type: row.type, value: row.type === 'fingerprint' ? row.fingerprint : row.ip })"
                    class="text-[10px] font-black uppercase tracking-tighter transition-colors"
                    :class="isDarkMode ? 'text-rose-500/80 hover:text-rose-400' : 'text-rose-600 hover:text-rose-500'">
                    {{ $t('common.unban') }}
                  </button>
                </template>
              </DataTable>
            </div>

            <!-- Whitelist management -->
            <div class="p-8 rounded-3xl border transition-colors duration-300"
              :class="isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100 shadow-sm'">
              <div class="flex items-center justify-between border-b pb-6 mb-6" :class="isDarkMode ? 'border-white/5' : 'border-slate-200'">
                <div class="flex items-center gap-3">
                  <ShieldCheck class="w-5 h-5 text-emerald-500" />
                  <span class="text-xs font-black uppercase tracking-widest" :class="isDarkMode ? 'text-white' : 'text-slate-900'">{{ $t('settings.others.whitelist_management') }}</span>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full" :class="isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-600'">{{ activeWhitelist.length }}</span>
                </div>
                <button @click="defenseStore.fetchWhitelist()" class="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors" :class="isDarkMode ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'">{{ $t('common.refresh') }}</button>
              </div>

              <div class="flex gap-4 items-end mb-6">
                <div class="w-28">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">Type</label>
                  <select v-model="newWlType"
                    class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border appearance-none"
                    :class="isDarkMode ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'">
                    <option value="ip">IP</option>
                    <option value="fingerprint">FP</option>
                  </select>
                </div>
                <div class="flex-1">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">{{ newWlType === 'fingerprint' ? 'Fingerprint' : $t('settings.others.ip_address') }}</label>
                  <input v-model="newWlIp" type="text" :placeholder="newWlType === 'fingerprint' ? 'a1b2c3d4e5f6...' : '192.168.1.1'"
                    class="w-full rounded-xl px-4 py-3 text-sm font-mono font-bold outline-none transition-all border"
                    :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-emerald-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-emerald-500'">
                </div>
                <div class="w-40">
                  <label class="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 block px-1">{{ $t('settings.others.whitelist_duration') }}</label>
                  <input v-model.number="newWlDuration" type="number" placeholder="1200"
                    class="w-full rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all border"
                    :class="isDarkMode ? 'bg-black/40 border-white/10 text-white focus:border-emerald-500/50' : 'bg-white border-slate-200 text-slate-900 shadow-sm focus:border-emerald-500'">
                </div>
                <PrimaryButton @click="handleAddWhitelist" variant="emerald" size="sm">
                  <Plus class="w-4 h-4" />
                </PrimaryButton>
              </div>

              <DataTable :is-dark="isDarkMode" :columns="whitelistColumns" :data="activeWhitelist" :empty-message="$t('settings.others.no_active_whitelist')">
                <template #cell-target="{ row }">
                  <span class="font-mono text-xs font-bold" :class="isDarkMode ? 'text-emerald-400' : 'text-emerald-600'">{{ row.type === 'fingerprint' ? row.fingerprint : row.ip }}</span>
                </template>
                <template #cell-type="{ row }">
                  <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md"
                    :class="row.type === 'fingerprint' ? 'bg-violet-500/10 text-violet-400' : (isDarkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-100 text-cyan-600')">
                    {{ row.type === 'fingerprint' ? 'FP' : 'IP' }}
                  </span>
                </template>
                <template #cell-remaining="{ row }">
                  <span class="text-[10px] font-bold" :class="isDarkMode ? 'text-slate-400' : 'text-slate-500'">{{ formatRemaining(row.remainingSeconds) }}</span>
                </template>
                <template #cell-action="{ row }">
                  <button @click="handleRemoveWhitelist({ type: row.type, value: row.type === 'fingerprint' ? row.fingerprint : row.ip })"
                    class="text-[10px] font-black uppercase tracking-tighter transition-colors"
                    :class="isDarkMode ? 'text-rose-500/80 hover:text-rose-400' : 'text-rose-600 hover:text-rose-500'">
                    {{ $t('common.remove') }}
                  </button>
                </template>
              </DataTable>
            </div>
          </div>

        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import {
  Settings, Layout, ShieldCheck, ShieldAlert,
  MapPin, Activity, RefreshCw, Trash2,
  Database, LayoutGrid, ChevronRight, ChevronDown, Plus, Monitor, Lock, Globe, Languages, Bug, Check, Wifi, Shield
} from 'lucide-vue-next'
import BaseModal from '../ui/BaseModal.vue'
import StatusPing from '../ui/StatusPing.vue'
import NavItem from '../ui/NavItem.vue'
import SettingRow from '../ui/SettingRow.vue'
import FormField from '../ui/FormField.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import TagInput from '../ui/TagInput.vue'
import PrimaryButton from '../ui/PrimaryButton.vue'
import DataTable from '../ui/DataTable.vue'
import { useUiStore } from '@/stores/ui'
import { useDashboardStore } from '@/stores/dashboard'
import { useSettingsStore } from '@/stores/settings'
import { useConfigsStore } from '@/stores/configs'
import { useDefenseStore } from '@/stores/defense'
import { firewallApi } from '@/api/firewall'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close'])

// 直接访问 stores
const uiStore = useUiStore()
const dashboardStore = useDashboardStore()
const settingsStore = useSettingsStore()
const configsStore = useConfigsStore()
const defenseStore = useDefenseStore()

const { isDarkMode, loading } = storeToRefs(uiStore)
const { summary, serverPosition } = storeToRefs(dashboardStore)
const { securitySettings, availableIpApis } = storeToRefs(settingsStore)
const { configs } = storeToRefs(configsStore)
const { activeBlocks, activeWhitelist } = storeToRefs(defenseStore)

const { locale, t } = useI18n()
const activeTab = ref('panel')
const apiDropdownOpen = ref(false)
const apiSelectRef = ref<HTMLElement | null>(null)

const handleApiClickOutside = (e: MouseEvent) => {
  if (apiSelectRef.value && !apiSelectRef.value.contains(e.target as Node)) {
    apiDropdownOpen.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', handleApiClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleApiClickOutside))

const tabs = computed(() => [
  { id: 'panel', label: t('settings.tabs.panel'), icon: Layout },
  { id: 'api', label: t('settings.tabs.security'), icon: ShieldCheck },
  { id: 'firewall', label: t('settings.tabs.firewall'), icon: ShieldAlert },
  { id: 'others', label: t('settings.tabs.others'), icon: Settings }
])

const currentTabLabel = computed(() => tabs.value.find(tab => tab.id === activeTab.value)?.label || '')

const newBlockIp = ref('')
const newBlockDuration = ref(86400)
const newBlockPermanent = ref(true)
const newBlockStatus = ref('BLOCKED')
const newBlockType = ref<'ip' | 'fingerprint'>('ip')

const newWlIp = ref('')
const newWlDuration = ref(1200)
const newWlType = ref<'ip' | 'fingerprint'>('ip')

function formatRemaining(seconds: number | null | undefined) {
  if (seconds == null) return t('common.permanent')
  if (seconds <= 0) return t('common.expired')
  if (seconds < 60) return `${seconds}${t('common.sec')}`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('common.min')}${seconds % 60}${t('common.sec')}`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}${t('common.hr')}${m}${t('common.min')}`
}

const botPatternsFormatted = computed({
  get: () => {
    const val = securitySettings.value?.defense?.botPatterns
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (securitySettings.value?.defense) {
      securitySettings.value.defense.botPatterns = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

const browserPatternsFormatted = computed({
  get: () => {
    const val = securitySettings.value?.defense?.browserPatterns
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (securitySettings.value?.defense) {
      securitySettings.value.defense.browserPatterns = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

const sensitivePathsFormatted = computed({
  get: () => {
    const val = securitySettings.value?.defense?.geoRules?.sensitivePaths
    return Array.isArray(val) ? val.join('\n') : ''
  },
  set: (val) => {
    if (securitySettings.value?.defense?.geoRules) {
      securitySettings.value.defense.geoRules.sensitivePaths = val.split('\n').map(s => s.trim()).filter(Boolean)
    }
  }
})

const expandedSection = ref(null)
const toggleSection = (key: string) => {
  expandedSection.value = expandedSection.value === key ? null : key
}

const onToggle = (key: string) => {
  settingsStore.handleSavePartial({ [key]: securitySettings.value.defense[key] })
}

const defenseModules = computed(() => [
  { key: 'enableRateLimit', label: t('settings.firewall.defense_modules.rate_limit'), sub: 'Rate Limit', icon: Activity, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500' },
  { key: 'enableAutoBlacklist', label: t('settings.firewall.defense_modules.scanner'), sub: 'Auto Block', icon: Bug, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-500' },
  { key: 'enableBruteForce', label: t('settings.firewall.defense_modules.brute_force'), sub: 'Brute Force', icon: Lock, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500' },
  { key: 'enableConnLimit', label: t('settings.firewall.defense_modules.conn_limit'), sub: 'Conn Limit', icon: Wifi, iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-500' },
  { key: 'enableGeoFilter', label: t('settings.firewall.defense_modules.geo_filter'), sub: 'Geo Filter', icon: Globe, iconBg: 'bg-blue-500/10', iconColor: 'text-blue-500' },
  { key: 'enableBotChallenge', label: t('settings.firewall.defense_modules.bot_detect'), sub: 'Bot Detect', icon: Shield, iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500' },
])

async function handleSyncNode() {
  try {
    await firewallApi.updateNode(serverPosition.value)
  } catch (err) {
    console.error('同步节点失败:', err)
  }
}

async function handleRefreshNode() {
  loading.value = true
  try {
    await dashboardStore.refreshNodeLocation()
  } finally {
    loading.value = false
  }
}

async function handleSaveNode() {
  await handleSyncNode()
  emit('close')
}

async function handleSaveSecurity() {
  await settingsStore.saveSecuritySettings()
}

function handleSavePartial(data: Record<string, any>) {
  settingsStore.handleSavePartial(data)
}

function handleTagAdd(data: { field: string; value: string }) {
  settingsStore.handleTagAdd(data)
}

function handleTagRemove(data: { field: string; index: number }) {
  settingsStore.handleTagRemove(data)
}

function handleRemoveBlock(data: { type: 'ip' | 'fingerprint'; value: string }) {
  defenseStore.handleRemoveBlock(data)
}

function handleRemoveWhitelist(data: { type: 'ip' | 'fingerprint'; value: string }) {
  defenseStore.handleRemoveWhitelist(data)
}

async function handleFetchData() {
  loading.value = true
  try {
    await Promise.all([
      configsStore.fetchConfigs(),
      settingsStore.fetchSettings(),
      defenseStore.fetchBlocks(),
      defenseStore.fetchWhitelist()
    ])
  } finally {
    loading.value = false
  }
}

async function handleResetStats() {
  if (!confirm('确认清除所有流量记录？')) return
  loading.value = true
  try {
    await firewallApi.clearRecords()
    dashboardStore.resetSummary()
    await handleFetchData()
  } finally {
    loading.value = false
  }
}

const handleAddBlock = () => {
  if (!newBlockIp.value) return
  defenseStore.handleAddBlock({
    type: newBlockType.value,
    [newBlockType.value === 'fingerprint' ? 'fingerprint' : 'ip']: newBlockIp.value,
    permanent: newBlockPermanent.value,
    duration: newBlockPermanent.value ? undefined : newBlockDuration.value,
    status: newBlockStatus.value
  })
  newBlockIp.value = ''
}

const handleAddWhitelist = () => {
  if (!newWlIp.value) return
  defenseStore.handleAddWhitelist({
    type: newWlType.value,
    [newWlType.value === 'fingerprint' ? 'fingerprint' : 'ip']: newWlIp.value,
    duration: newWlDuration.value || 1200
  })
  newWlIp.value = ''
}

// DataTable column definitions
const blockColumns = computed(() => [
  { key: 'target', label: t('common.source'), class: 'flex-1' },
  { key: 'type', label: 'Type', class: 'w-20 text-center' },
  { key: 'status', label: t('common.status'), class: 'w-24 text-center' },
  { key: 'expire', label: t('common.expire'), class: 'w-28 text-center' },
  { key: 'action', label: t('common.action'), class: 'w-20 text-right' }
])

const whitelistColumns = computed(() => [
  { key: 'target', label: t('common.source'), class: 'flex-1' },
  { key: 'type', label: 'Type', class: 'w-20 text-center' },
  { key: 'remaining', label: t('common.remaining'), class: 'w-36 text-center' },
  { key: 'action', label: t('common.action'), class: 'w-20 text-right' }
])
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
