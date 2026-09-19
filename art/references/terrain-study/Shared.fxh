//--------------------------------------------------------------------------------------
// File:		Shared.fxh
// Description:	
// Date:		
//--------------------------------------------------------------------------------------
#ifndef _SHARED_FXH
#define _SHARED_FXH

#ifndef __cplusplus 
#	define VECTOR2 float2
#	define VECTOR3 float3
#	define VECTOR4 float4
#endif
//
static const float MAX_HEIGHTMAP_VALUE = 64.f;
static const int HEIGHTMAP_REF_ZERO255 = 62; // 60 in photoshop for some reason (idk why)
static const float PLANT_FOLIAGE_MAX_OFFSET = 4.f;
static const int WIND_SIMULATION_SIZE_XZ = 64;
static const int WIND_SIMULATION_SIZE_Y = 16;
static const float WIND_SIMULATION_TEXEL_SIZE = 1.f;
static const float MAX_WIND_VELOCITY = 16.f;

//
// Terrain
//
static const int TERRAIN_BLOCK_HEIGHTMAP_SIZE = 49;
static const int TERRAIN_BLOCK_BLOCKMAP_SIZE = 25;

static const int TERRAIN_BLOCK_NUM_SUBBLOCKS = 4;
static const int TERRAIN_BLOCK_SUBBLOCKMAP_SIZE = (TERRAIN_BLOCK_BLOCKMAP_SIZE - 1) / TERRAIN_BLOCK_NUM_SUBBLOCKS + 1;
static const int TERRAIN_BLOCK_SUBHEIGHTMAP_SIZE = (TERRAIN_BLOCK_HEIGHTMAP_SIZE - 1) / TERRAIN_BLOCK_NUM_SUBBLOCKS + 1;
static const int TERRAIN_SUBBLOCK_MAX_LAYERS = 6;

static const float TERRAIN_TEXTURE_TILING = .08f;
static const float TERRAIN_BLOCK_SIZE = 16.f;
static const float TERRAIN_SUBBLOCK_SIZE = TERRAIN_BLOCK_SIZE / TERRAIN_BLOCK_NUM_SUBBLOCKS;
static const VECTOR2 TERRAIN_BLOCK_SIZE_XZ = VECTOR2(TERRAIN_BLOCK_SIZE, TERRAIN_BLOCK_SIZE);

struct TERRAINLAYER_PARAMS {
	float fBlendingParam;
	float fTilingScale;
	float fEdgeSharpen;
	float fVerticalityMultiplier;
	float fBaseDesaturationBrightness;
};

static const float TERRAIN_OCCLUSION_HEIGHT_LEVEL0 = .5f;
static const float TERRAIN_OCCLUSION_HEIGHT_LEVEL1 = 2.f;
static const float TERRAIN_OCCLUSION_HEIGHT_LEVEL2 = 9.f;

static const float PLANT_ANIMATION_TYPE_NONE = 0.f;
static const float PLANT_ANIMATION_TYPE_WIND = 1.f;
static const float PLANT_ANIMATION_TYPE_WATER = 2.f;

static const VECTOR3 AMBIENT_WIND_DIRECTION = VECTOR3(1.f, 0, 0);	
static const VECTOR3 AMBIENT_WIND_PERP = VECTOR3(0, 0, 1.f);

static const float MAX_LIGHTING_RADIUS = 32.f;
static const float MAX_LIGHTING_HEIGHT_OFFSET_RANGE = 12.f;
static const float MAX_LIGHTING_HEIGHT_OFFSET_MARGIN = 4.f;
static const float MAX_LIGHTING_COLOR_CHANNEL_VALUE = 16.f;

//
// Water
//
static const int WATERPOOL_WATERMAP_SIZE = 16;
static const float WATER_CLIP_DEPTH = -.25f;
struct WATERTYPE_PARAMS {
	VECTOR3 vDiffuse;
	float _pad0;
	VECTOR3 vFoam;
	float _pad1;
	VECTOR3 vRefraction;
	float _pad2;
	float fTintBias;
	float fTintDepth;
	float fOpacityBias;
	float fOpacityDepth;
};

#ifndef __cplusplus 
#	undef VECTOR2
#	undef VECTOR3
#	undef VECTOR4
#endif
#endif
//EOF