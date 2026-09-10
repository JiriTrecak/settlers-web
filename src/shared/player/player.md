# Player palette

One palette in player.ts supplies gameplay, editor entity rendering, player spawn markers, minimap markers, and placement ghosts. Slots are zero-based internally: player 1 is red.

Order: red #A04B31, blue #2878DF, green #34A853, yellow #F2CF35, orange #ED842A, purple #9656CF, cyan #36CBD0, white #EEEEEE.

Only exact TC_TeamColor materials opt into recoloring. Unowned objects retain their authored colors. CSS/RGB helpers derive from the same palette.
