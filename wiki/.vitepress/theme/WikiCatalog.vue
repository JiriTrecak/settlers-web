<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import catalog from "../../.generated/catalog.json";
const props = defineProps<{ section?: string; faction?: string }>();
const entries = computed(() =>
  catalog.entries.filter(
    (e) =>
      (!props.section || e.section === props.section) &&
      (!props.faction || e.faction === props.faction),
  ),
);
</script>
<template>
  <div class="wiki-catalog">
    <a
      v-for="entry in entries"
      :key="entry.id"
      :href="withBase(entry.path + '.html')"
      class="catalog-entry"
    >
      <img
        v-if="entry.icon"
        :src="withBase(entry.icon)"
        alt=""
        width="64"
        height="64"
        loading="lazy"
      />
      <span
        ><strong>{{ entry.name }}</strong
        ><small>{{ entry.description }}</small></span
      >
    </a>
  </div>
</template>
