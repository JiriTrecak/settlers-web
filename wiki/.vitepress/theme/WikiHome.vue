<script setup lang="ts">
import { withBase } from "vitepress";
import catalog from "../../.generated/catalog.json";
const count = (section: string) =>
  catalog.entries.filter((e) => e.section === section).length;
const chapters = [
  {
    number: "01",
    title: "The living economy",
    text: "Amber. Wood. Workers. Grow the colony, protect its gatherers, and decide who becomes a soldier.",
    path: "/guide/economy.html",
    icon: "/media/icons/icon.item.amber.png",
  },
  {
    number: "02",
    title: "An army with a cost",
    text: "Recruit a real worker. Choose your battles. Bring a stronger colony home.",
    path: "/guide/combat.html",
    icon: "/media/icons/icon.ants.warrior.png",
  },
  {
    number: "03",
    title: "A champion rises",
    text: "Meet the Ant Marshal. Learn abilities, claim camp rewards, and build toward level ten.",
    path: "/guide/heroes.html",
    icon: "/media/icons/icon.ants.marshal.png",
  },
];
</script>
<template>
  <main class="wiki-home">
    <section class="wiki-hero">
      <img
        class="hero-art"
        :src="withBase('/media/forest-heroes.png')"
        alt="Armored ant, beetle and bee champions beneath a dark forest canopy"
        fetchpriority="high"
        width="1672"
        height="941"
      />
      <div class="hero-copy">
        <p class="eyebrow">THE OFFICIAL DEVELOPMENT WIKI</p>
        <h1>Small creatures.<br /><em>Great empires.</em></h1>
        <p class="hero-description">
          A field guide to life, labor and war<br class="desktop-break" />
          under the canopy.
        </p>
        <a class="wiki-primary" :href="withBase('/guide/getting-started.html')"
          >Start your first colony <span aria-hidden="true">↗</span></a
        ><a class="hero-secondary" :href="withBase('/buildings/')"
          >Explore the encyclopedia →</a
        >
      </div>
      <div class="hero-caption">
        <span class="status-dot"></span> ANTS PLAYABLE
        <span class="caption-divider">/</span> BEETLES & BEES PLANNED
      </div>
    </section>
    <div class="home-content">
      <section class="wiki-intro">
        <div>
          <p class="eyebrow">KNOW YOUR COLONY</p>
          <h2>The forest rewards<br />those who understand it.</h2>
        </div>
        <p>
          Learn the rules, plan your economy and meet the creatures beyond your
          clearing. Stats, costs and rewards on these pages come directly from
          the game’s declarations.
        </p>
      </section>
      <section class="chapter-grid" aria-label="Game guides">
        <a
          v-for="chapter in chapters"
          :key="chapter.number"
          :href="withBase(chapter.path)"
          class="chapter"
          ><span class="chapter-number">{{ chapter.number }}</span
          ><img :src="withBase(chapter.icon)" alt="" width="72" height="72" />
          <h3>{{ chapter.title }}</h3>
          <p>{{ chapter.text }}</p>
          <span class="chapter-link"
            >Read the guide <span aria-hidden="true">↗</span></span
          ></a
        >
      </section>
      <section class="encyclopedia-strip" aria-label="Encyclopedia">
        <a
          v-for="s in ['buildings', 'units', 'items', 'resources']"
          :key="s"
          :href="withBase('/' + s + '/')"
          ><strong>{{ count(s) }}</strong
          ><span>{{ s }} <span aria-hidden="true">↗</span></span></a
        ><a :href="withBase('/maps/')"
          ><strong>{{ catalog.maps.length }}</strong
          ><span>battlefields ↗</span></a
        >
      </section>
      <section class="atlas-callout">
        <div>
          <p class="eyebrow">BEYOND YOUR CLEARING</p>
          <h2>Choose your battlefield.</h2>
          <p>
            Scout the waterways, starting positions and neutral camps of every
            authored map.
          </p>
          <a :href="withBase('/maps/')">Open the map atlas →</a>
        </div>
        <a
          :href="withBase('/maps/crownmere-basin.html')"
          aria-label="Explore Crownmere Basin"
          ><img
            :src="withBase('/media/maps/crownmere-basin.svg')"
            alt="Crownmere Basin terrain atlas"
            width="320"
            height="320"
            loading="lazy"
        /></a>
      </section>
      <section class="wiki-source">
        <p>
          <strong>Built from the game.</strong>
          {{ catalog.entries.length }} definitions · balance revision
          <code>{{ catalog.fingerprint }}</code
          >. Ants are the current playable faction; the other lineages and
          campaigns are still in design.
        </p>
        <a :href="withBase('/development/')">How this wiki is maintained ↗</a>
      </section>
    </div>
  </main>
</template>
