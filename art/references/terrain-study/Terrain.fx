//--------------------------------------------------------------------------------------
// File:		Terrain.fx
// Description:
// Date:		19/10/08 7:41 PM
//				25/07/19 6:16 PM
//--------------------------------------------------------------------------------------
//
#define FORCE_LIGHTMAP_OCCLUSION_LEVEL0

//
#include "../Common.fxh"
#include "../Lighting.fxh"

#include "Shared.fxh"
#include "TerrainCommon.fxh"

//-----------------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------------

CONST_BUFFER_BEGIN_EX(CB_INSTANCE, SCOURING_TERRAIN, USAGE_DS | USAGE_PS)
CONST_BUFFER_END;

CONST_BUFFER_BEGIN_EX(CB_SHARED, SCOURING_TERRAIN, USAGE_VS | USAGE_DS | USAGE_PS)
	DECLARE_FLOAT(g_fDisplacementTilingScale, EC_TERRAIN_DISPLACEMENT_TILING_SCALE)
	#ifdef _EDITOR
		DECLARE_FLOAT4(g_vUseExternMapMask, EC_TERRAIN_USE_EXTERN_MAP)
		DECLARE_FLOAT(g_fUseExternHeightmap, EC_TERRAIN_USE_EXTERN_HEIGHTMAP)
		DECLARE_FLOAT(g_fNumGroundLayers, EC_TERRAIN_NUM_GROUND_LAYERS)
	#endif
CONST_BUFFER_END;

//-----------------------------------------------------------------------------
// Texture samplers
//-----------------------------------------------------------------------------
DECLARE_TEX2D_ARRAY_EX(TEX_REG_3, TX_TERRAIN_LAYERMAPS, SMP_CLAMP_LINEAR, USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_ARRAY(TEX_REG_4, TX_TERRAIN_LAYERS_AR_ARRAY, SMP_WRAP_ANISO_SRGB);
//DECLARE_TEX2D_ARRAY(TEX_REG_5, TX_TERRAIN_LAYERS_NH_ARRAY, SMP_WRAP_ANISO);
DECLARE_TEX2D_ARRAY_EX(TEX_REG_4, TX_TERRAIN_LAYERS_AR_ARRAY, SMP_WRAP_ANISO_SRGB, USAGE_DS | USAGE_PS);
DECLARE_TEX2D_ARRAY_EX(TEX_REG_5, TX_TERRAIN_LAYERS_NH_ARRAY, SMP_WRAP_ANISO, USAGE_DS | USAGE_PS);
//DECLARE_TEX2D_EX(TEX_REG_6, TX_TERRAIN_GRASSYMAP, SMP_WRAP_LINEAR, USAGE_PS);
DECLARE_TEX2D_EX(TEX_REG_7, TX_TERRAIN_DISPLACEMENTMAP, SMP_WRAP_LINEAR, USAGE_PS | USAGE_DS);
DECLARE_TEX2D_EX(TEX_REG_8, TX_TERRAIN_DISPLACEMENT, SMP_WRAP_LINEAR, USAGE_PS | USAGE_DS);
//DECLARE_TEX2D(TEX_REG_8, TX_TERRAIN_TRAMPLE_AR, SMP_WRAP_ANISO_SRGB);
//DECLARE_TEX2D(TEX_REG_9, TX_TERRAIN_TRAMPLE_NH, SMP_WRAP_ANISO);

#ifdef _EDITOR
	DECLARE_TEX2D(TEX_REG_29, TX_TERRAIN_EXTERN_MAP, SMP_BORDER_LINEAR);
	DECLARE_TEX2D_EX(TEX_REG_30, TX_TERRAIN_EXTERN_HEIGHTMAP, SMP_BORDER_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
#endif

#define TX_TERRAIN_LAYERS_PARAMS TEX_BUFFER_REG_0
#ifdef _EDITOR
	#define TX_TERRAIN_LAYERS_GROUND_BRIGHTNESS	TEX_BUFFER_REG_1
#endif

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

DECLARE_TEXTURE_BUFFER(StructuredBuffer<TERRAINLAYER_PARAMS>, TB_LAYERS_PARAMS, TX_TERRAIN_LAYERS_PARAMS)
#ifdef _EDITOR
	DECLARE_TEXTURE_BUFFER(Buffer<float>, TB_LAYERS_GROUND_BRIGHTNESS, TX_TERRAIN_LAYERS_GROUND_BRIGHTNESS)
#endif

//float GetCorpseMapAt(in float2 worldPosXZ, bool isPoint) {
//	float2 terrainTC = (worldPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
//	// v is inverted because we use lhs camera when rendering from the top
//	if (isPoint) {
//		return sampleLevel2Dex(TX_TCOMMON_CORPSEMAP, float2(terrainTC.x, 1.f - terrainTC.y), SMP_CLAMP_POINT).r;
//	} else {
//		return sampleLevel2D(TX_TCOMMON_CORPSEMAP, float2(terrainTC.x, 1.f - terrainTC.y)).r;
//	}		
//}//
////--------------------------------------------------------------------------------------
TERRAINLAYER_PARAMS GetTerrainLayerParams(uint nLayer) {
	return TB_LAYERS_PARAMS[nLayer];
}
float GetTerrainHeightPrecise(in float2 worldPosXZ) {
	float2 texCoord = GetTerrainHeightmapTexCoord(worldPosXZ);
	//float height = sampleLevel2D(TX_TERRAIN_HEIGHTMAP, terrainTC).r * MAX_HEIGHTMAP_VALUE;
	float h;
	{
		// https://www.iquilezles.org/www/articles/hwinterpolation/hwinterpolation.htm
		// TODO: optimize/investigate? but this is not PS
		const float2 heightmapSize = 1.f / g_vTerrainPosData.zw / TERRAIN_BLOCK_SIZE * (TERRAIN_BLOCK_HEIGHTMAP_SIZE - 1) + 1;
		const float2 texelSize = 1 / heightmapSize;

		float2 st = (texCoord / texelSize) - 0.5f;

		float2 iuv = floor(st);
		float2 fuv = frac(st);

		float a = sampleLevel2Dex(TX_TCOMMON_HEIGHTMAP, (iuv + float2(0.5f, 0.5f)) * texelSize, SMP_CLAMP_POINT).r;
		float b = sampleLevel2Dex(TX_TCOMMON_HEIGHTMAP, (iuv + float2(1.5f, 0.5f)) * texelSize, SMP_CLAMP_POINT).r;
		float c = sampleLevel2Dex(TX_TCOMMON_HEIGHTMAP, (iuv + float2(0.5f, 1.5f)) * texelSize, SMP_CLAMP_POINT).r;
		float d = sampleLevel2Dex(TX_TCOMMON_HEIGHTMAP, (iuv + float2(1.5f, 1.5f)) * texelSize, SMP_CLAMP_POINT).r;
		h = lerp(
			lerp(a, b, fuv.x),
			lerp(c, d, fuv.x),
			fuv.y);
	}
	
	#ifdef _EDITOR
		// heightmap is pervertex
		h = lerp(h, sampleLevel2D(TX_TERRAIN_EXTERN_HEIGHTMAP, texCoord).r, g_fUseExternHeightmap);
	#endif
	return UnpackHeight(h);
}//
//-----------------------------------------------------------------------------

void BlendLayers(inout float4 layers_ar, inout float4 layers_nh,
	in float4 layer_ar, in float4 layer_nh, in float layerMap, in float blendingParam = -1.f)
{
	float k;
	float h;
	if (blendingParam >= 0) {
		// blend by layer height		
		k = saturate(((layer_nh.a + .5f) * layerMap - layers_nh.a + .25f) / blendingParam);

		// make we sure blend in opaque laters
		//k = saturate(k + saturate(layerMap - .75f) / .25f);

		h = layer_nh.a;
	} else {		
		// blend by layer alpha
		k = GetSharpBlendMask(layerMap, 1 - layer_nh.a, 1.f + (-blendingParam));
		h = .5f;
	}
//	if (blendingParam == -1.01f) {
		//layer_ar.rgb *= saturate((layerMap - .25f) / .5f);
//	}

	layers_ar = lerp(layers_ar, layer_ar, k);
	layers_nh = lerp(layers_nh, float4(layer_nh.xyz, h), k);

//	if (blendingParam == -1.01f) {
		//layers_ar.rgb *= .5f + abs(layerMap - .5f);		
		//layers_ar.rgb *= saturate(0 + abs(layerMap - .25f) / .25f);
		//layers_ar.rgb *= saturate(0.f + abs(k - .25f) / .25f);
		//layers_ar.rgb *= saturate(.25f + abs(k - .5f) / .75f);
//		layers_ar.rgb *= saturate(0.f + abs(k - .5f) / .5f);
//	}
}//
//--------------------------------------------------------------------------------------

void GetTerrainLayersColor(out float4 layers_ar, out float4 layers_nh,
	in float2 worldPosXZ, float4 layersIndicesPlus1, float2 layersIndicesPlus2,
	in _texture2DArray texLayerMaps, in _texture2DArray texLayersAR, in _texture2DArray texLayersNH, 
	uniform float textureLevel = -1.f, uniform float normalY = 1.f)
{
	float2 terrainTC = (worldPosXZ - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	float underlaysMask = GetUnderlaysMaskAt(worldPosXZ);
	//layers_ar = float4(underlaysMask.xxx,1);
	//layers_nh = float4(0, 1, 0, 0);
	//return;
	//float displacementMask = sampleLevel2D(TX_TERRAIN_DISPLACEMENTMAP, terrainTC).r;

	float layersIndicesPlus[TERRAIN_SUBBLOCK_MAX_LAYERS];
	layersIndicesPlus[0] = layersIndicesPlus1.x;
	layersIndicesPlus[1] = layersIndicesPlus1.y;
	layersIndicesPlus[2] = layersIndicesPlus1.z;
	layersIndicesPlus[3] = layersIndicesPlus1.w;
	layersIndicesPlus[4] = layersIndicesPlus2.x;
	layersIndicesPlus[5] = layersIndicesPlus2.y;
	{
		float layerIndex0 = layersIndicesPlus[0] - 1.f;

		TERRAINLAYER_PARAMS params = GetTerrainLayerParams(layerIndex0 + .5f);
		float2 textureTC = worldPosXZ * params.fTilingScale * TERRAIN_TEXTURE_TILING;
		//if (numLayers > 1) {
		//	return float4(1, 0, 0, 0);
		//}
		if (textureLevel >= 0) {
			layers_ar = sampleLevel2DArray(texLayersAR, float3(textureTC, layerIndex0), textureLevel);
			layers_nh = sampleLevel2DArray(texLayersNH, float3(textureTC, layerIndex0), textureLevel);
		} else {
			layers_ar = sample2DArray(texLayersAR, float3(textureTC, layerIndex0));
			layers_nh = sample2DArray(texLayersNH, float3(textureTC, layerIndex0));
		}
	}
	// darken the erased based layer
	layers_ar.rgb *= 1.f - max(underlaysMask - .75f, 0);

	//{
	//	float3 tintColor =
	//		lerp(TERRAIN_TINT_GRASS, TERRAIN_TINT_DIRT, GetTerrainLayerTintType(uint(layerIndex0 + .5f)));
	//	layers_ar.rgb *= lerp(float3(1, 1, 1), tintColor, wetness_tint.y);
	//}
	int numLayers = 0;
	int i;
	[unroll]
	for (i = 1; i < TERRAIN_SUBBLOCK_MAX_LAYERS; i++) {
		// no layermap for the base layer
		float layerIndex = layersIndicesPlus[i] - 1.f;
		if (layerIndex > 0.f) {
			TERRAINLAYER_PARAMS params = GetTerrainLayerParams(layerIndex + .5f);
			float2 textureTC = worldPosXZ * params.fTilingScale * TERRAIN_TEXTURE_TILING;
			float4 layer_ar, layer_nh;
			if (textureLevel >= 0) {
				layer_ar = sampleLevel2DArray(texLayersAR, float3(textureTC, layerIndex), textureLevel);
				layer_nh = sampleLevel2DArray(texLayersNH, float3(textureTC, layerIndex), textureLevel);
			} else {
				layer_ar = sample2DArray(texLayersAR, float3(textureTC, layerIndex));
				layer_nh = sample2DArray(texLayersNH, float3(textureTC, layerIndex));
			}		

			float layerMap = sampleLevel2DArray(texLayerMaps, float3(terrainTC, layerIndex - 1.f)).r;
			layerMap *= 1.f - underlaysMask * (1.f - layers_nh.a * .5f);			
			if (params.fVerticalityMultiplier >= 0) {
				// reduce at slopes
				layerMap *= lerp(1.f, saturate(normalY), params.fVerticalityMultiplier);
			} else {
				// increase at slopes
				layerMap = saturate(layerMap + (1.f - normalY) * -params.fVerticalityMultiplier);
			}
			//layers_ar = float4(layerMap.xxx, 1);
			//return;

			// sharpen the edge
			layer_ar.rgb *= lerp(1.f, saturate((layerMap - .25f) / .75f), params.fEdgeSharpen);

			if (params.fBaseDesaturationBrightness > 0) {
				layers_ar.rgb = lerp(layers_ar.rgb, dot(layer_ar.rgb, params.fBaseDesaturationBrightness).xxx, saturate((layerMap - .5f) / .5f));
			}

			//float3 tintColor =
			//	lerp(TERRAIN_TINT_GRASS, TERRAIN_TINT_DIRT, GetTerrainLayerTintType(uint(layerIndex + .5f)));
			//layer_ar.rgb *= lerp(float3(1, 1, 1), tintColor, wetness_tint.y);
			BlendLayers(layers_ar, layers_nh, layer_ar, layer_nh, layerMap, params.fBlendingParam);

			numLayers++;
		}
	}
	/*	if (numLayers == 1) {
			layers_ar = float4(1.f, 0,0, 1.f);
		}
		if (numLayers == 2) {
			layers_ar = float4(0, 1.f, 0, 1.f);
		}
		if (numLayers == 3) {
			layers_ar = float4(0,0, 1.f, 1.f);
		}*/
}//
//--------------------------------------------------------------------------------------

// Structures
struct VS_INPUT
{
	float4 vSubblockData0 : BYTEDATA0;
	float4 vSubblockData1 : BYTEDATA1;
};

struct VS_HS_OUTPUT
{
	float3 worldPos : WORLDPOS;
	float4 layersIndicesPlus1 : LAYERSINDICESPLUS1;
	float2 layersIndicesPlus2 : LAYERSINDICESPLUS2;
};

struct DS_OUTPUT
{
	float4 worldPos_alpha : WORLDPOSALPHA;
	float2 texCoordPosXZ : TEXCOORDPOSXZ;
	float3 baseNormal : BASENORMAL;
	float4 fogColor : FOGCOLOR;
	float4 layersIndicesPlus1 : LAYERSINDICESPLUS1;
	float2 layersIndicesPlus2 : LAYERSINDICESPLUS2;
};

//-----------------------------------------------------------------------------
// Functions
//-----------------------------------------------------------------------------
// Main
VS_HS_OUTPUT terrainVS(const VS_INPUT v, uint vertexID : SV_VertexID)
{
	VS_HS_OUTPUT Out;
	// no world matrix, object space equals world space
//#ifdef HAS_MUDMAP
//	float2 vQuadPos = v.vPos;
//#else
	float2 quadXZ[4] = {
		float2(0, 0),
		float2(0, 1),
		float2(1, 1),
		float2(1, 0)
	};
	float2 vQuadPos = quadXZ[vertexID];
//#endif

	float sub_x = v.vSubblockData0.b * 255.f;
	float sub_z = v.vSubblockData0.g * 255.f;

	float3 worldPos;
	worldPos.x = g_vTerrainPosData.x + sub_x * TERRAIN_SUBBLOCK_SIZE;
	worldPos.z = g_vTerrainPosData.y + sub_z * TERRAIN_SUBBLOCK_SIZE;
	worldPos.xz += vQuadPos * TERRAIN_SUBBLOCK_SIZE;
	worldPos.y = GetTerrainHeightPrecise(worldPos.xz);

	Out.worldPos = worldPos;
	Out.layersIndicesPlus1.x = v.vSubblockData0.r * 255.f;
	Out.layersIndicesPlus1.y = v.vSubblockData0.a * 255.f;
	Out.layersIndicesPlus1.z = v.vSubblockData1.b * 255.f;
	Out.layersIndicesPlus1.w = v.vSubblockData1.g * 255.f;
	Out.layersIndicesPlus2.x = v.vSubblockData1.r * 255.f;
	Out.layersIndicesPlus2.y = v.vSubblockData1.a * 255.f;
	return Out;
}

//--------------------------------------------------------------------------------------
// Hull shader 
// Patch Constant Function
HS_DEFAULT_QUAD_CONSTANT_OUTPUT TerrainConstantHS(
	InputPatch<VS_HS_OUTPUT, 4> ip,
	uint patchID : SV_PrimitiveID)
{
	HS_DEFAULT_QUAD_CONSTANT_OUTPUT Out;
#ifdef QUALITY_LOW
	Out.Edges[0] = 1;
	Out.Edges[1] = 1;
	Out.Edges[2] = 1;
	Out.Edges[3] = 1;

	Out.Inside[0] = 1;
	Out.Inside[1] = 1;
#else
	const float tessDistStart = 64.f;
	const float tessDistInterval = 512.f;
	ComputeDefaultQuadConstant(Out,
		ip[0].worldPos,
		ip[1].worldPos,
		ip[2].worldPos,
		ip[3].worldPos,
		tessDistStart, tessDistInterval);
	Out.Edges[0] = clamp(Out.Edges[0], 2, 32);
	Out.Edges[1] = clamp(Out.Edges[1], 2, 32);
	Out.Edges[2] = clamp(Out.Edges[2], 2, 32);
	Out.Edges[3] = clamp(Out.Edges[3], 2, 32);
	Out.Inside[0] = clamp(Out.Inside[0], 2, 32);
	Out.Inside[1] = clamp(Out.Inside[1], 2, 32);
#endif
	/*
	Out.Edges[0] = 256;
	Out.Edges[1] = 256;
	Out.Edges[2] = 256;
	Out.Edges[3] = 256;

	Out.Inside[0] = 256;
	Out.Inside[1] = 256;
	*/

	/*
	const float tess = 32.f;
	Out.Edges[0] = tess;
	Out.Edges[1] = tess;
	Out.Edges[2] = tess;
	Out.Edges[3] = tess;

	Out.Inside[0] = tess;
	Out.Inside[1] = tess;*/
	return Out;
}


HS_DEFAULT_QUAD_FUNCTION_BEGIN(VS_HS_OUTPUT, terrainHS, TerrainConstantHS)
	HS_DEFAULT_PASSTHROUGH(worldPos)
	HS_DEFAULT_PASSTHROUGH(layersIndicesPlus1)
	HS_DEFAULT_PASSTHROUGH(layersIndicesPlus2)
HS_DEFAULT_FUNCTION_END

//--------------------------------------------------------------------------------------

// Domain shader
[domain("quad")]
DS_OUTPUT terrainDS(HS_DEFAULT_QUAD_CONSTANT_OUTPUT inputConstant,
	float2 uv : SV_DomainLocation,
	const OutputPatch<VS_HS_OUTPUT, 4> inputPatch, out float4 oProjPos : SV_Position)
{
	DS_OUTPUT Out;
	
	float3 worldPos;
	worldPos = DS_DEFAULT_QUAD_EVALUATE(worldPos);
	Out.texCoordPosXZ = worldPos.xz;

	// tessellated height
	worldPos.y = GetTerrainHeightPrecise(worldPos.xz);
	//{
	//	const float DEPTH_MARGIN = 32.0;
	//	float corpseMap = GetCorpseMapAt(worldPos.xz, true);
	//	if (corpseMap < 1.f) {
	//		worldPos.y = clamp((1.f - corpseMap) * (MAX_HEIGHTMAP_VALUE + DEPTH_MARGIN) - .25f, worldPos.y, worldPos.y + .5f);
	//	}
	//}
	Out.baseNormal = GetTerrainNormal(worldPos.xz);
	Out.fogColor = ComputeTerrainFog(worldPos);
	Out.layersIndicesPlus1 = inputPatch[0].layersIndicesPlus1;
	Out.layersIndicesPlus2 = inputPatch[0].layersIndicesPlus2;
		
	float2 terrainTC = (worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	float displacementMask = sampleLevel2D(TX_TERRAIN_DISPLACEMENTMAP, terrainTC).r;	
	{
		float4 layers_ar;
		float4 layers_nh;
		GetTerrainLayersColor(layers_ar, layers_nh,
			worldPos.xz, Out.layersIndicesPlus1, Out.layersIndicesPlus2,
			TX_TERRAIN_LAYERMAPS, TX_TERRAIN_LAYERS_AR_ARRAY, TX_TERRAIN_LAYERS_NH_ARRAY, 0);
		
		float underlaysMask = GetUnderlaysMaskAt(worldPos.xz);
		//underlaysMask = 0;
		const float displacementScale = .5f;
		worldPos.y += (layers_nh.a - .5f) * displacementScale * (1.f - displacementMask) * (1.f - underlaysMask);
	}	
	//{
	//	float2 terrainTC = (worldPos.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	//	TERRAINLAYER_PARAMS params = GetTerrainLayerParams(0);

	//	float2 textureTC = worldPos.xz * params.fTilingScale * TERRAIN_TEXTURE_TILING;
	//	float h = sampleLevel2DArray(TX_TERRAIN_LAYERS_NH_ARRAY, float3(textureTC, 0), 0).a;

	//	worldPos.y += (h - .5f) * .5f;
	//}

	// displacement layer
	{	
		float2 textureTC = worldPos.xz * g_fDisplacementTilingScale * TERRAIN_TEXTURE_TILING;
		float4 d = sampleLevel2D(TX_TERRAIN_DISPLACEMENT, textureTC);

		float3x3 tbn = GetTangentSpaceBasisFromNormal(Out.baseNormal);
		float3 n = normalize(mul(UnpackNormal(d.xyz), tbn));		
		
		const float displacementScale = .5f;
		worldPos.xz -= n.xz * displacementScale * displacementMask;
		worldPos += Out.baseNormal * (d.a - .25f) * displacementMask;
	}
	Out.worldPos_alpha.xyz = worldPos;
	Out.worldPos_alpha.w = GetFogSSAOFactor(Out.fogColor);

	oProjPos = mul(float4(worldPos, 1), g_tmViewProj);
	return Out;
}//
//--------------------------------------------------------------------------------------

//--------------------------------------------------------------------------------------
// Pixel shader
float4 terrainPS(const DS_OUTPUT v, in float4 vScreenPos : SV_Position, out float4 outColor1 : SV_Target1) : SV_Target0
{
	outColor1 = 1;
			
	// clip by cutmap
	float2 screenTC = vScreenPos.xy * g_vRTSizeInv;
	ClipByTerrainCutmap(screenTC, v.worldPos_alpha.xyz);

	float2 terrainTC = (v.worldPos_alpha.xz - g_vTerrainPosData.xy) * g_vTerrainPosData.zw;
	//float2 wetness_tint = sampleLevel2D(TX_TCOMMON_BLOCKSMAP, terrainTC).rg;	
	float3 baseNormal = GetTerrainNormal(v.worldPos_alpha.xz);

	float4 layers_ar;
	float4 layers_nh;
	GetTerrainLayersColor(layers_ar, layers_nh,
		v.texCoordPosXZ, v.layersIndicesPlus1, v.layersIndicesPlus2,
		TX_TERRAIN_LAYERMAPS, TX_TERRAIN_LAYERS_AR_ARRAY, TX_TERRAIN_LAYERS_NH_ARRAY, 0, baseNormal.y);
	//return v.worldPos_alpha.aaaa;

//#ifndef _EDITOR
//	{
//		const float tilingScale = .08f;
//		float roadsMap = sampleLevel2D(TX_TCOMMON_ROADSMAP, terrainTC).r;
//		//return roadMap.xxxx;
//		float4 roadNH = sample2D(TX_TCOMMON_ROAD_NH, v.worldPos_alpha.xz * tilingScale);
//		float4 roadAR = sample2D(TX_TCOMMON_ROAD_AR, v.worldPos_alpha.xz * tilingScale);
//		//roadAR.rgb *= lerp(float3(1, 1, 1), TERRAIN_TINT_DIRT, wetness_tint.y);
//
//		float t = GetSharpBlendMask(roadsMap, roadNH.a, 4.f);
//		roadAR.rgb *= 0 + abs(t - .5f) * 2.f;
//
//		layers_ar = lerp(layers_ar, roadAR, t);
//		layers_nh.rgb = lerp(layers_nh.rgb, roadNH.xyz, t);
//	}
//#endif	
	//{
	//	float trampleMap = sampleLevel2D(TX_TCOMMON_TRAMPLEMAP, terrainTC).r;
	//	//return float4(trampleMap.xxxx);

	//	const float tilingScale = .2f;		
	//	float4 trampleAR = sample2D(TX_TERRAIN_TRAMPLE_AR, v.worldPos_alpha.xz * tilingScale * TERRAIN_TEXTURE_TILING);
	//	float4 trampleNH = sample2D(TX_TERRAIN_TRAMPLE_NH, v.worldPos_alpha.xz * tilingScale * TERRAIN_TEXTURE_TILING);

	//	float t = GetSharpBlendMask(trampleMap, trampleNH.a, 2.f);
	//	//trampleAR.rgb *= 0 + abs(t - .5f) * 2.f;

	////	layers_ar = lerp(layers_ar, trampleAR, t);
	////	layers_nh.rgb = lerp(layers_nh.rgb, trampleNH.xyz, t);
	//}
	//{
	//	float corpseMap = GetCorpseMapAt(v.worldPos_alpha.xz, false);
	//	if (corpseMap < 1.f) {
	//		layers_ar.rgb *= .6f;
	//		//layers_ar.rgb = .01f;
	//		layers_ar.a = 1.f;
	//		layers_nh = float4(0, 1.f, 0, 1.f);
	//	}
	//	//return corpseMap.xxxx;
	//}
	
	float3 layersNormal;
	{
		float3x3 tbn = GetTangentSpaceBasisFromNormal(baseNormal);
		float3 localNormal = UnpackNormal(layers_nh.xyz);
		layersNormal = normalize(mul(localNormal * float3(1,1,.25f), tbn));
		//return float4(layersNormal.xyz, 1);
	}
	
	SURFACE_DESC surface;
	surface.albedo = layers_ar.rgb;
	surface.backside = 0;
	surface.worldPos = v.worldPos_alpha.xyz;
	surface.worldNormal = layersNormal;
	surface.metalness = 0;
	surface.roughness = layers_ar.a;

	float displacementMask;
	{
		// displacement occlusion
		float2 textureTC = v.texCoordPosXZ * g_fDisplacementTilingScale * TERRAIN_TEXTURE_TILING;
		float displacementOcclusion = 
			saturate(sampleLevel2D(TX_TERRAIN_DISPLACEMENT, textureTC).a / .6f + .0f);
		displacementMask = sampleLevel2D(TX_TERRAIN_DISPLACEMENTMAP, terrainTC).r;
		surface.occlusion = lerp(1.f, .5f + displacementOcclusion * .5f, displacementMask);
	}	
	ApplyDefaultWetness(surface);

	//float macroMult = (1.f - displacementMask);// *(1.f - abs(layers_nh.a - .5f) / .5f);
	//ApplyMacroColor(surface, macroMult);
	ApplyMacroColor(surface);
	ApplyDefaultOcclusion(surface);

	float3 color = GetDefaultSurfaceColor(surface);
	//color = sampleLevel2D(TX_TERRAIN_DISPLACEMENTMAP, terrainTC).rrr;
	//return sampleLevel2D(TX_TCOMMON_GROUNDMAP, terrainTC);
	//float2 bendTC = (v.worldPos_alpha.xz - g_vVisiblePosData.xy) * g_vVisiblePosData.zw;
	//return sampleLevel2D(TX_TCOMMON_FOLIAGE_BEND, bendTC);
	//{
	//	float2 lightMapTC = (surface.worldPos.xz - g_vLightMapNearPosData.xy) * g_vLightMapNearPosData.zw;
	//	return sampleLevel2D(TX_TCOMMON_LIGHTMAPLIGHTING_NEARA, lightMapTC);
	//}
#ifdef _EDITOR	
	float3 externMap = sampleLevel2D(TX_TERRAIN_EXTERN_MAP, terrainTC);
	color = lerp(color, g_vUseExternMapMask.rgb, dot(externMap, g_vUseExternMapMask.rgb) * g_vUseExternMapMask.a * .5f);
	//color = lerp(color, sampleLevel2D(TX_TERRAIN_EXTERN_MAP, terrainTC).rgb, g_fUseExternMap * .5f);
	color = lerp(color, float3(1, 0, 0), sampleLevel2D(TX_TERRAIN_EXTERN_HEIGHTMAP, terrainTC).g * .2f);
#endif
	ApplyFog(color, v.fogColor);

	outColor1.rg = (layersNormal.xz + 1.f) / 2.f;
	outColor1.a = 1.f;// wetness_tint.x;

	DO_DEBUG_SHADER_OUTPUT(surface.albedo, surface.metalness, surface.roughness, surface.occlusion, 1);
	
	// ssao factor
	float outAlpha = GetLightingSSAOFactor(v.worldPos_alpha.w);

	//float c = sampleLevel2Dex(TX_TCOMMON_CLOAKING_A, terrainTC, SMP_CLAMP_POINT).r;
	//color = pow(c.rrr, 2.f);

//	float underlaysMask = GetUnderlaysMaskAt(v.worldPos_alpha.xz);
//	float grassyMask = sampleLevel2D(TX_TERRAIN_GRASSYMAP, terrainTC).r;
//	grassyMask *= 1.f - underlaysMask;
//	outAlpha *= lerp(1.f, SSAO_FACTOR_GRASS, grassyMask);
	//return grassyMask.xxxx;
	return float4(color, outAlpha);
}//
//-----------------------------------------------------------------------------
float4 terrainZFillPS(const DS_OUTPUT v, in float4 vScreenPos : SV_Position) : SV_Target0
{
	// clip by cutmap
	float4 viewerProjPos = mul(float4(v.worldPos_alpha.xyz,1), g_tmViewerViewProj);
	float2 viewerScreenTC;
	viewerScreenTC.x = (viewerProjPos.x / viewerProjPos.w + 1.f) / 2.f;
	viewerScreenTC.y = (1.f - viewerProjPos.y / viewerProjPos.w) / 2.f;
	ClipByTerrainCutmap(viewerScreenTC, viewerProjPos);

	return 0;
}//
//-----------------------------------------------------------------------------

#ifdef _EDITOR
float4 printMapPS(in float2 tc : TEXCOORD0) : SV_Target0 {	
	// using bias seems to give smoother transitions
	const float bias = 15.99f;

	float2 worldPosXZ = g_vTerrainPosData.xy + tc / g_vTerrainPosData.zw;
	float4 layers_ar;
	float4 layers_nh;
	{
		TERRAINLAYER_PARAMS params = TB_LAYERS_PARAMS[0];
		float2 textureTC = worldPosXZ * params.fTilingScale * TERRAIN_TEXTURE_TILING;

		//layers_ar = sample2DArray(TX_TERRAIN_LAYERS_AR_ARRAY, float3(textureTC, 0));
		//layers_nh = sample2DArray(TX_TERRAIN_LAYERS_NH_ARRAY, float3(textureTC, 0));
		layers_ar = sampleBias2DArray(TX_TERRAIN_LAYERS_AR_ARRAY, float3(textureTC, 0), bias);
		layers_nh = sampleBias2DArray(TX_TERRAIN_LAYERS_NH_ARRAY, float3(textureTC, 0), bias);
		layers_ar.rgb *= TB_LAYERS_GROUND_BRIGHTNESS[0];
	}
	int numLayers = (int)(g_fNumGroundLayers + .5f);
	int i;
	for (i = 1; i < numLayers; i++) {
		float layerMap = sampleLevel2DArray(TX_TERRAIN_LAYERMAPS, float3(tc, i - 1.f)).r;

		TERRAINLAYER_PARAMS params = TB_LAYERS_PARAMS[i];
		float2 textureTC = worldPosXZ * params.fTilingScale * TERRAIN_TEXTURE_TILING;

		//float4 layer_ar = sample2DArray(TX_TERRAIN_LAYERS_AR_ARRAY, float3(textureTC, i));
		//float4 layer_nh = sample2DArray(TX_TERRAIN_LAYERS_NH_ARRAY, float3(textureTC, i));
		float4 layer_ar = sampleBias2DArray(TX_TERRAIN_LAYERS_AR_ARRAY, float3(textureTC, i), bias);
		float4 layer_nh = sampleBias2DArray(TX_TERRAIN_LAYERS_NH_ARRAY, float3(textureTC, i), bias);
		layer_ar.rgb *= TB_LAYERS_GROUND_BRIGHTNESS[i];

		// ignoring blend mode seem to give smoother transitions
		BlendLayers(layers_ar, layers_nh, layer_ar, layer_nh, layerMap/*, params.fBlendingParam*/);
	}
	// we dont apply macro color so that minimap looks cleaner
	//{
	//	SURFACE_DESC surface;
	//	surface.albedo = layers_ar.rgb;
	//	surface.backside = 0;
	//	surface.worldPos = float3(worldPosXZ.x, 0, worldPosXZ.y);
	//	surface.worldNormal = _UP;
	//	surface.metalness = 0;
	//	surface.roughness = layers_ar.a;
	//	surface.occlusion = 0;
	//	ApplyMacroColor(surface);

	//	layers_ar.rgb = surface.albedo;
	//}
	return float4(layers_ar.rgb, 0.f);
}//
//-----------------------------------------------------------------------------
#endif

//--------------------------------------------------------------------------------------
#endif //__cplusplus

//--------------------------------------------------------------------------------------
// Techniques
//--------------------------------------------------------------------------------------
DECLARE_TECHNIQUE_EX(Color, terrainVS, terrainHS, terrainDS, terrainPS);
DECLARE_TECHNIQUE_EX(ZFill, terrainVS, terrainHS, terrainDS, terrainZFillPS);

#ifdef _EDITOR
	DECLARE_TECHNIQUE(PrintMap, passThroughTexVS, printMapPS);
#endif
//EOF
