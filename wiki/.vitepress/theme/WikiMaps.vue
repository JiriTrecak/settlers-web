<script setup lang="ts">
import { withBase } from "vitepress";
import catalog from "../../.generated/catalog.json";
</script>
<template>
  <div class="wiki-maps">
    <a
      v-for="map in catalog.maps"
      :key="map.id"
      :href="withBase(map.path + '.html')"
      class="map-entry"
    >
      <img
        :src="withBase(map.image)"
        :alt="map.name + ' terrain preview'"
        width="320"
        height="320"
        loading="lazy"
      />
      <div>
        <small
          >{{ map.size }} × {{ map.size }} · {{ map.players }} players ·
          {{ map.camps }} camps</small
        ><strong>{{ map.name }}</strong>
        <p>{{ map.description }}</p>
      </div>
    </a>
  </div>
</template>
