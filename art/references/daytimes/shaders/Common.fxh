//--------------------------------------------------------------------------------------
// File:		Common.fxh
// Description:	Just a collection of common code pieces
// Date:		10/10/08 16:16
// Modified:	17/07/09 11:46 PM
//				07/05/19 9:49 AM
//--------------------------------------------------------------------------------------
#ifndef _COMMON_FXH
#define _COMMON_FXH

#ifndef __cplusplus
#	pragma warning(disable : 3571) // pow(f, e) will not work for negative f, use abs(f) or conditionally handle negative values if you expect them
#endif

#include "Platform.fxh"

//-----------------------------------------------------------------------------
// Global variables
//-----------------------------------------------------------------------------
DECLARE_TEX2D(TEX_COMMON_REG_0, TX_COMMON_Z, SMP_CLAMP_LINEAR);
DECLARE_TEX2D_EX(TEX_COMMON_REG_1, TX_COMMON_SHADOWMAP, SMP_CLAMP_LINEAR_CMP, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEX2D_EX_UINT2(TEX_COMMON_REG_2, TX_COMMON_LIGHTSLOOKUP, USAGE_VS | USAGE_DS | USAGE_PS);

DECLARE_TEX2D_EX(TEX_COMMON_REG_3, TX_COMMON_GGXBRDFLUT, SMP_CLAMP_LINEAR, USAGE_VS | USAGE_DS | USAGE_PS);
DECLARE_TEXCUBE_EX(TEX_COMMON_REG_4, TX_COMMON_GGXREFLCUBE, SMP_WRAP_LINEAR_SRGB, USAGE_VS | USAGE_DS | USAGE_PS);

CONST_BUFFER_BEGIN_COMMON(CB_COMMON_TARGET)
	DECLARE_FLOAT2(g_vRTSizeInv, EC_COMMON_RT_SIZE_INV)
	DECLARE_FLOAT2(g_vVPSizeInv, EC_COMMON_VP_SIZE_INV)
	DECLARE_FLOAT(g_fShaderOutput, EC_COMMON_SHADER_OUTPUT)
CONST_BUFFER_END;

CONST_BUFFER_BEGIN_COMMON(CB_COMMON_CAMERA)
	DECLARE_FLOAT3(g_vEyePos, EC_COMMON_EYE_POS)
	DECLARE_FLOAT4(g_vViewDir, EC_COMMON_VIEW_DIR)
	DECLARE_FLOAT4X4(g_tmViewProj, EC_COMMON_VIEW_PROJ)
	DECLARE_FLOAT4X4(g_tmView, EC_COMMON_VIEW)
	DECLARE_FLOAT4_ARRAY(g_frustumDirs, EC_COMMON_FRUSTUMDIRS, 4)
CONST_BUFFER_END;

CONST_BUFFER_BEGIN_COMMON(CB_COMMON_SCENE)
	DECLARE_FLOAT(g_fSceneTime, EC_COMMON_SCENETIME)
	DECLARE_FLOAT3(g_vSunColor, EC_COMMON_SUN_COLOR)	
	DECLARE_FLOAT3(g_vSunDir, EC_COMMON_SUN_DIR)
	DECLARE_FLOAT3(g_vSunPos, EC_COMMON_SUN_POS)
	DECLARE_FLOAT2(g_vSunSpotAtten, EC_COMMON_SUN_SPOT_ATTEN)
	DECLARE_FLOAT3(g_vAmbientColor, EC_COMMON_AMBIENT_COLOR)
	DECLARE_FLOAT3(g_vSkyColor, EC_COMMON_SKY_COLOR)
	DECLARE_FLOAT3(g_vFogColor, EC_COMMON_FOG_COLOR)
	DECLARE_FLOAT4(g_vFogParams, EC_COMMON_FOG_PARAMS)
	DECLARE_FLOAT4X4(g_tmSMViewProj, EC_COMMON_SM_VIEWPROJ)
	DECLARE_FLOAT3(g_vSMParams, EC_COMMON_SM_PARAMS)	
	DECLARE_FLOAT4(g_vLightsLookupPosData, EC_COMMON_LIGHTSLOOKUP_POSDATA)
	DECLARE_FLOAT2(g_vLightsLookupSize, EC_COMMON_LIGHTSLOOKUP_SIZE)
CONST_BUFFER_END;

// registers are used in ModelBase.fxh
#define TEX_BASED_REG_0 TEX_REG_5
#define TEX_BASED_REG_1 TEX_REG_6
#define TEX_BASED_REG_2 TEX_REG_7
#define TEX_BASED_REG_3 TEX_REG_8

//--------------------------------------------------------------------------------------
// Shader code
//--------------------------------------------------------------------------------------
#ifndef __cplusplus

DECLARE_TEXTURE_BUFFER(Buffer<float4>, TB_MATRICES, TEX_MATRICES_REG)

//--------------------------------------------------------------------------------------
// Common variables
//--------------------------------------------------------------------------------------

#define MAX_REFL_CUBEMAP_LOD 8.0
#define IRRADIANCE_REFL_CUBEMAP_LOD 6.0
#define MATH_FP_HALF_MAX 64512.f // 5e5m

//const variables
static const float3 _UP = float3(0.f, 1.f, 0.f);
static const float _PI = 3.14159265f;
static const float EPSILON = 0.0001f;

static const float SQRT_2 = 1.4142f;
static const float SQRT_3 = 1.7321f;

#ifndef MIN_INSTANCE_SCALE
#	define MIN_INSTANCE_SCALE .25f
#endif
#ifndef MAX_INSTANCE_SCALE
#	define MAX_INSTANCE_SCALE 4.f
#endif

static const float AKILL_REF = .5f;
static const float AKILL_REF_Z = .4f;

//static float g_fToneMapWhite = 1.f;
//--------------------------------------------------------------------------------------
// Common functions
//--------------------------------------------------------------------------------------
float _sqrt(in float val) {
	if (val >= EPSILON) {
		return sqrt(val);
	} else {
		return 0;
	}
}//
//--------------------------------------------------------------------------------------	
float pow2(float x) {
	return x * x;
}
//--------------------------------------------------------------------------------------	
float3 BlendSoftLight(in float3 a, in float3 b) {
	/*return lerp(
		sqrt(a) * (2.f * b - 1.f) + (2.f * a) * (1.f - b),
		2.f * a * b + a*a * (1.f - 2.f * b), step(b,.5f));*/
	return lerp(
		2.f * a * b + a * a * (1.f - 2.f * b),
		sqrt(a) * (2.f * b - 1.f) + (2.f * a) * (1.f - b), step(a, .5f));
}//
//-----------------------------------------------------------------------------
float3 BlendOverlay(in float3 a, in float3 b) {
	return lerp(
		(1.f - (1.f - 2.f*(a - .5f)) * (1.f - b)),
		((2.f*a) * b), step(a, .5f));
}//
//-----------------------------------------------------------------------------
float4 BlendScreen(in float4 a, in float4 b) {
	return 1.f - (1.f - a) * (1.f - b);
}//
//-----------------------------------------------------------------------------
float3 BlendDodge(in float3 a, in float3 b) {
	return a / (1.f - b);
}//
//-----------------------------------------------------------------------------
float GetSharpBlendMask(float blend, float mask, float sharpness) {
	return saturate(mask + (blend - mask) * sharpness);
}//
//-----------------------------------------------------------------------------
float3 GetRight(in float4x4 tm) {
	return float3(tm[0].x, tm[1].x, tm[2].x);
}//
//--------------------------------------------------------------------------------------	
float3 GetUp(in float4x4 tm) {
	return float3(tm[0].y, tm[1].y, tm[2].y);
}//
//--------------------------------------------------------------------------------------	
float3 GetDir(in float4x4 tm) {
	return float3(tm[0].z, tm[1].z, tm[2].z);
}//
//--------------------------------------------------------------------------------------	
float2 GetPerpendicularCCW(in float2 v) {
	return float2(-v.y, v.x);
}//
//--------------------------------------------------------------------------------------	
float2 GetPerpendicularCW(in float2 v) {
	return float2(v.y, -v.x);
}//
//--------------------------------------------------------------------------------------	
float GetRGBIntensity(in float3 v) {
	return v.x * 0.299f + v.y * 0.587f + v.z * 0.114f;
}//
//--------------------------------------------------------------------------------------	
float3 PackNormal(in float3 normal) {
	return normal / 2.f + .50196f;
}
float2 PackNormal2(in float2 normal) {
	return normal / 2.f + .50196f;
}
//--------------------------------------------------------------------------------------
float2 UnpackNormal2(in float2 packedNormal) {
	return 2.f * (packedNormal - .50196f);
}//
//--------------------------------------------------------------------------------------	
float3 UnpackNormal(in float3 packedNormal) {
	return 2.f * (packedNormal - .50196f);
}//
//--------------------------------------------------------------------------------------	
float4 UnpackNormal4(in float4 packedNormal) {
	return 2.f * (packedNormal - .50196f);
}//
//--------------------------------------------------------------------------------------	
float3 UnpackXZNormal(float2 packedNormal)
{
	float3 normal = 0.f;
	normal.xz = UnpackNormal2(packedNormal.xy);
	normal.y = _sqrt(1.f - normal.x * normal.x - normal.z * normal.z);
	return normal;
}//
//--------------------------------------------------------------------------------------
float3 UnpackXYNormal(float2 packedNormal) {
	return UnpackXZNormal(packedNormal).xzy;
}//
//--------------------------------------------------------------------------------------
float4 UnpackVec4FromFloat(float value, float intensity)
{
	float4 result;
	result.a = value - floor(value);

	value /= 64.f;
	result.r = value - floor(value);

	value /= 64.f;
	result.g = value - floor(value);

	value /= 64.f;
	result.b = value - floor(value);

	// scale to 1
	result *= 64.f / 63.f;
	return result * intensity;
}//
//--------------------------------------------------------------------------------------
float2 UnpackVec2FromFloat(float value, float intensity)
{
	float2 result;
	result.r = value - floor(value);

	value /= 65535.f;
	result.g = value - floor(value);

	// scale to 1
	result *= 65536.f / 65535.f;
	return result * intensity;
}//
//--------------------------------------------------------------------------------------
float UnpackScale(float value) {
	return lerp(MIN_INSTANCE_SCALE, MAX_INSTANCE_SCALE, value);
}//
//--------------------------------------------------------------------------------------
float4 UnpackFloat4From1(float value)
{
	float4 result;
	result.a = value - floor(value);

	value /= 64.f;
	result.r = value - floor(value);

	value /= 64.f;
	result.g = value - floor(value);

	value /= 64.f;
	result.b = value - floor(value);

	//result *= 64.f / 63.f;
	return result;
}//
//--------------------------------------------------------------------------------------
float4 ScreenToProj(in float4 vPos) {
	return float4((vPos.xy * g_vVPSizeInv - .5f) * float2(2.f, -2.f), vPos.zw);	
}
//------------------------------------------------------------------------------
float ConvertDepthToZ(float z, float2 vNearPlane_QInv) {
	return vNearPlane_QInv.x / (1.f - z * vNearPlane_QInv.y);
}//
//-----------------------------------------------------------------------------
//http://www.thetenthplanet.de/archives/1180
float3x3 CotangentFrame(in float3 N, in float3 p, in float2 uv)
{
	// get edge vectors of the pixel triangle
	float3 dp1 = ddx(p);
	float3 dp2 = ddy(p);
	float2 duv1 = ddx(uv);
	float2 duv2 = ddy(uv);

	// solve the linear system
	float3 dp2perp = cross(dp2, N);
	float3 dp1perp = cross(N, dp1);
	float3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	float3 B = dp2perp * duv1.y + dp1perp * duv2.y;

	// construct a scale-invariant frame
	float invmax = rsqrt(max(dot(T, T), dot(B, B)));
	//T = normalize(cross(T, B));
	return float3x3(T * invmax, B * invmax, N);
}//
//------------------------------------------------------------------------------
float3x3 GetTangentSpaceBasisFromNormal(in float3 N, in float3 _T = float3(1.f, 0.f, 0.f)) {
	float3 B = normalize(cross(_T, N));
	float3 T = normalize(cross(N, B));
	return float3x3(T, B, N);
}//
//------------------------------------------------------------------------------------
// get tangent space basis. Output matrix transforms vector from tangent space to world space
float3x3 GetTangentSpaceBasis(in float3 vTangent, in float3 vNormal, in float tangentW) {
	float binormalSign = 2.f * (tangentW - .5f);
	#ifdef TANGENTSPACE_BINORMAL_SIGN
		binormalSign *= TANGENTSPACE_BINORMAL_SIGN;
	#endif
 	float3 vBinormal = binormalSign * cross(vTangent, vNormal);
	
	// World		Normal map (assumed)
	// 
	//	|y				|z
	//	|  / z			|  / x
	//	| /				| /
	//	|/______ x		|/______ y
	// Assuming all normal maps to have X map to 
	float3x3 tangentSpace = float3x3(
		vTangent,	// X <- Z (u)
		vBinormal,	// Y <- X (v)
		vNormal		// Z <- Y
		);
	return tangentSpace;
}//
//------------------------------------------------------------------------------
////--------------------------------------------------------------------------------------
//float ReinhardOp(float L, float White)
//{
//	float whiteFix = 1.0f + (L / (pow2(White) + 1e-5)) * step(1e-5, White);
//	return L * whiteFix / (L + 1.0f);
//}//
////----------------------------------------------------------------------------
//float3 ToneMap(float3 color)
//{
//	float lum = GetRGBIntensity(color);
//	float mappedLum = ReinhardOp(lum, g_fToneMapWhite);
//	return color * mappedLum / (lum + 1e-5);
//}//
////----------------------------------------------------------------------------
float2 GetBrdfLut(float NoV, float roughness) {
	return sampleLevel2D(TX_COMMON_GGXBRDFLUT, float2(NoV, 1.0 - roughness)).rg;
}//
//----------------------------------------------------------------------------
uint ReverseBits32(uint bits)
{
	return reversebits(bits);
	// Non SM5 variant:
	// bits = ( bits << 16) | ( bits >> 16);
	// bits = ( (bits & 0x00ff00ff) << 8 ) | ( (bits & 0xff00ff00) >> 8 );
	// bits = ( (bits & 0x0f0f0f0f) << 4 ) | ( (bits & 0xf0f0f0f0) >> 4 );
	// bits = ( (bits & 0x33333333) << 2 ) | ( (bits & 0xcccccccc) >> 2 );
	// bits = ( (bits & 0x55555555) << 1 ) | ( (bits & 0xaaaaaaaa) >> 1 );
	// return bits;
}
float2 Hammersley(uint Index, uint NumSamples, uint2 Random)
{
	float E1 = frac(float(Index) / NumSamples/* + float( Random.x & 0xffff ) / (1 << 16)*/);
	float E2 = float(ReverseBits32(Index) /* ^ Random.y*/) * 2.3283064365386963e-10;
	return float2(E1, E2);
}

float GetRangeAtten(float distSq, float attenRange) {
	return 1.f / exp(distSq / attenRange);
}//
//--------------------------------------------------------------------------------------	
float GetNearAtten(float nearAttenStartSq, float nearAttenRangeSqInv, float distSquared) {
	return saturate((distSquared - nearAttenStartSq) * nearAttenRangeSqInv);
}//
//--------------------------------------------------------------------------------------
float GetSpotAtten(in float2 spotAtten, in float3 lightToVertN, in float3 lightDir) {
	float cosInnerCone = spotAtten.x;
	float cosOuterCone = spotAtten.y;	
	float cosDirection = dot(lightToVertN, lightDir);

	//return pow(smoothstep(cosOuterCone, cosInnerCone, cosDirection), 2.f);
	//return saturate((cosDirection - cosOuterCone) / (cosInnerCone - cosOuterCone));
	float t = saturate((cosDirection - cosOuterCone) / (cosInnerCone - cosOuterCone));
	return pow(t, 4.f);
	//return 1.f - pow(1.f - t, 4.f);
}//
//--------------------------------------------------------------------------------------	
float ComputeFogHeightIntegral(float densityScale, float heightStart, float heightEnd) {
	if (densityScale > 0.00001f) {
		return (exp(-densityScale * heightStart) - exp(-densityScale * heightEnd)) / densityScale;
	} else {
		return heightEnd - heightStart;
	}	
}//
//------------------------------------------------------------------------------
float4 ComputeFog(in float3 worldPos, in float baseHeight = 0) {
	const float fogDensity = g_vFogParams.x;	
	const float fogStartDist = g_vFogParams.y;
	const float fogHeight = g_vFogParams.z;
	const float fogUpperScale = g_vFogParams.w;

	float3 vertToEye = g_vEyePos - worldPos;
	float vertToEyeDist = length(vertToEye);

	float4 fogColor;
	fogColor.rgb = g_vFogColor;
	{
		float yMax = max(g_vEyePos.y, worldPos.y);
		float yMin = min(g_vEyePos.y, worldPos.y);

		float upper1 = max(yMax - (baseHeight + fogHeight), 0.f);
		float upper0 = max(yMin - (baseHeight + fogHeight), 0.f);
		float lower0 = min(yMax - (baseHeight + fogHeight), 0.f);
		float lower1 = min(yMin - (baseHeight + fogHeight), 0.f);

		float fogInt = ComputeFogHeightIntegral(/*fogLowerScale*/0, -lower0, -lower1);
		fogInt += ComputeFogHeightIntegral(fogUpperScale, upper0, upper1);

		fogInt *= fogDensity * max(vertToEyeDist - fogStartDist, 0.f) / (yMax - yMin + 0.00001f);
		fogColor.a = 1 - exp2(-fogInt);
	}
	return fogColor;
}//
//------------------------------------------------------------------------------

void ApplyFog(inout float3 color, in float4 fogColor) {
	color = lerp(color, fogColor.rgb, fogColor.a);
}//
//------------------------------------------------------------------------------

float CalcSpline(in float sKp, in float3 sVal, in float arg)
{
	return arg < sKp ?
		lerp(sVal.x, sVal.y, arg / sKp) :
		lerp(sVal.y, sVal.z, saturate((arg - sKp) / (1 - sKp)));
}//
//--------------------------------------------------------------------------------------

float4 CalcColorSpline(in float4 sKp, in float4 sVal[4], in float arg)
{
	float sArg = clamp(arg, sKp[0], sKp[3]);
	float2 kp;
	kp = lerp(float2(sKp[0], sKp[1]), float2(sKp[1], sKp[2]), step(sKp[1], sArg));
	kp = lerp(kp, float2(sKp[2], sKp[3]), step(sKp[2], sArg));

	float4 val1;
	val1 = lerp(sVal[0], sVal[1], step(sKp[1], sArg));
	val1 = lerp(val1, sVal[2], step(sKp[2], sArg));
	float4 val2;
	val2 = lerp(sVal[1], sVal[2], step(sKp[1], sArg));
	val2 = lerp(val2, sVal[3], step(sKp[2], sArg));

	return lerp(val1, val2, (sArg - kp.x) / (kp.y - kp.x));
}//
//--------------------------------------------------------------------------------------

// See DirectX SDK function D3DXVec3CatmullRom()
/*float3 CatmullRom(in float3 p1, float3 p2, float3 p3, float3 p4, float s) {
   float3 s2 = s * s;
   float3 s3 = s2 * s;     
   return ((-s3 + 2 * s2 - s) * p1 + 
		   (3 * s3 - 5 * s2 + 2) * p2 + 
		   (-3 * s3 + 4 * s2 + s) * p3 + 
		   (s3 - s2) * p4) / 2;
}//
//--------------------------------------------------------------------------------------
float3 CatmullRomD(float3 p1, float3 p2, float3 p3, float3 p4, float s) {
   float3 s2 = s * s;   
   return ((-3 * s2 + 4 * s - 1) * p1 + 
		   (9 * s2 - 10 * s) * p2 + 
		   (-9 * s2 + 8 * s + 1) * p3 + 
		   (3 * s2 - 2 * s) * p4) / 2;
}//
//--------------------------------------------------------------------------------------*/
float3 ConstructHeightmapNormal(float hBase, float hRight, float hBottom, float du, float dv)
{
	float3 normal;
	normal.x = (hBase - hRight) / du;
	normal.y = 2.0f;
	normal.z = (hBase - hBottom) / dv;
	return normalize(normal);
}//
//--------------------------------------------------------------------------------------
float3 Gamma(in float3 c) {
	const float p = 2.2f;
	return pow(c, p);
}//
//------------------------------------------------------------------------------
float3 Degamma(in float3 c) {
	const float p = 1.f / 2.2f;
	return pow(c, p);
}//
//------------------------------------------------------------------------------
float3 ConvertSRGBToLinear(float3 color) {
	float3 mask = saturate(sign(color - 0.04045f));
	return (1 - mask) * color / 12.92f + mask * pow((color + 0.055f) / (1 + 0.055f), 2.4f);
}//
//----------------------------------------------------------------------------
float3 ConvertLinearToSRGB(float3 color) {
	return color < float3(0.0031308f, 0.0031308f, 0.0031308f)
		? 12.92f * color
		: 1.055f * pow(color, (1.f / 2.4f)) - 0.055f;
}//
//----------------------------------------------------------------------------
float4 ConvertLinearToSRGB(float4 color) {
	return float4(ConvertLinearToSRGB(color.rgb), color.a);
}//
//----------------------------------------------------------------------------
/*
float3x3 QuatToMatrix(float4 q)
{
#ifdef USE_FAST_QUAT_2_MATRIX
	// add: 12 = 9 + 3
	// mul: 16 = 12 + 4 
	// div:	 1

	// Quat to matrix conversion, see "Advanced Rendering Techniques" pp 363-364
	float s, xs, ys, zs, wx, wy, wz, xx, xy, xz, yy, yz, zz;
#ifdef NORMALIZE_FAST_QUAT_2_MATRIX
	s = 2.0f / dot(q, q);
#else
	s = 2.0f;
#endif

	xs = q.x * s;	ys = q.y * s;	zs = q.z * s;
	wx = q.w * xs;	wy = q.w * ys;	wz = q.w * zs;
	xx = q.x * xs;	xy = q.x * ys;	xz = q.x * zs;
	yy = q.y * ys;	yz = q.y * zs;	zz = q.z * zs;
	
	float3x3 r =
		float3x3(
			1.f - (yy + zz),	xy + wz,			xz - wy,
			xy - wz,			1.f - (xx + zz),	yz + wx,
			xz + wy,			yz - wx,			1.f - (xx + yy) );
			
#else
	// add: 15 = 6 + 9
	// mul: 16 = 12 + 4
	// div:	 1

	float dxy = q.x * q.y * 2.0f;
	float dxz = q.x * q.z * 2.0f;
	float dyz = q.y * q.z * 2.0f;
	float dwx = q.w * q.x * 2.0f;
	float dwy = q.w * q.y * 2.0f;
	float dwz = q.w * q.z * 2.0f;
	
	float x2 = q.x * q.x;
	float y2 = q.y * q.y;
	float z2 = q.z * q.z;
	float w2 = q.w * q.w;
	
	float3x3 r =
		float3x3(
			w2+x2-y2-z2,	dxy+dwz,		dxz-dwy,
			dxy-dwz,		w2-x2+y2-z2,	dyz+dwz,
			dxz-dwy,		dyz-dwx,		w2-x2-y2+z2 );				
#endif
	return r;
}
*/
float3x3 QuatToMatrix(float4 q) {
   float xs = q.x * 2;
   float ys = q.y * 2;
   float zs = q.z * 2;
   
   float wx = -q.w * xs;
   float wy = -q.w * ys;
   float wz = -q.w * zs;
   
   float xx = q.x * xs;
   float xy = q.x * ys;
   float xz = q.x * zs;
   
   float yy = q.y * ys;
   float yz = q.y * zs;
   float zz = q.z * zs;
   
   float3x3 tm;
   tm[0][0] = 1 - yy - zz;
   tm[1][0] = xy + wz;
   tm[2][0] = xz - wy;
   
   tm[0][1] = xy - wz;
   tm[1][1] = 1 - xx - zz;
   tm[2][1] = yz + wx;
   
   tm[0][2] = xz + wy;
   tm[1][2] = yz - wx;
   tm[2][2] = 1 - xx - yy;
   
   return tm;
}//
//------------------------------------------------------------------------------

void DoSkinning(inout float3 vPos, inout float3 vNormal, inout float3 vTangent, in float4 vBoneWeights, in uint4 vBoneIndices) {
	float3x4 tmWorld = 0;
	for (int i = 0; i < 4; i++) {
		float3x4 tmBone = {
			TB_MATRICES[vBoneIndices[i] * 3 + 0],
			TB_MATRICES[vBoneIndices[i] * 3 + 1],
			TB_MATRICES[vBoneIndices[i] * 3 + 2]
		};
		tmWorld += tmBone * vBoneWeights[i];
	}
	vPos = mul(tmWorld, float4(vPos, 1));
	vNormal = mul((float3x3)tmWorld, vNormal);
	vTangent = mul((float3x3)tmWorld, vTangent);

	// Same as: (but without optimisation, less instructions)
	//float4x3 tmWorld = 0;
	//for (int i = 0; i < 4; i++) {
	//	float4x3 tmBone;
	//	tmBone[0][0] = TB_MATRICES[vBoneIndices[i]*3 + 0][0];
	//	tmBone[1][0] = TB_MATRICES[vBoneIndices[i]*3 + 0][1];
	//	tmBone[2][0] = TB_MATRICES[vBoneIndices[i]*3 + 0][2];
	//	tmBone[3][0] = TB_MATRICES[vBoneIndices[i]*3 + 0][3];

	//	tmBone[0][1] = TB_MATRICES[vBoneIndices[i]*3 + 1][0];
	//	tmBone[1][1] = TB_MATRICES[vBoneIndices[i]*3 + 1][1];
	//	tmBone[2][1] = TB_MATRICES[vBoneIndices[i]*3 + 1][2];
	//	tmBone[3][1] = TB_MATRICES[vBoneIndices[i]*3 + 1][3];

	//	tmBone[0][2] = TB_MATRICES[vBoneIndices[i]*3 + 2][0];
	//	tmBone[1][2] = TB_MATRICES[vBoneIndices[i]*3 + 2][1];
	//	tmBone[2][2] = TB_MATRICES[vBoneIndices[i]*3 + 2][2];
	//	tmBone[3][2] = TB_MATRICES[vBoneIndices[i]*3 + 2][3];
	//	tmWorld += tmBone * vBoneWeights[i];
	//}
	//vPos = mul(float4(vPos, 1), tmWorld);
	//vNormal = mul(vNormal, (float3x3)tmWorld);
	//vTangent = mul(vTangent, (float3x3)tmWorld);

	vNormal = normalize(vNormal);
	vTangent = normalize(vTangent);
}
//------------------------------------------------------------------------------
/*float3x3 ConstructViewMatrix(const float3 vDir) {
	float3 zaxis = normalize(vDir),
		   xaxis = normalize(cross(_UP, zaxis)),
		   yaxis = cross(zaxis, xaxis);

	return float3x3(xaxis, yaxis, zaxis);
}//*/

#if defined(SKINNING)

	struct WORLD_TRANSFORM {
	   float4 vBoneWeights : BONEWEIGHTS;
	   uint4 vBoneIndices : BONEINDICES;
	};
	void TransformToWorldSpace(inout float3 vPos, inout float3 vNormal, inout float3 vTangent, in WORLD_TRANSFORM wtm) {
		DoSkinning( vPos, vNormal, vTangent, wtm.vBoneWeights, wtm.vBoneIndices );
	}
	void TransformToWorldSpace(inout float3 vPos, in WORLD_TRANSFORM wtm) {
		float3 vNormal = _UP;
		float3 vTangent = float3(1.f,0,0);
		DoSkinning( vPos, vNormal, vTangent, wtm.vBoneWeights, wtm.vBoneIndices );
	}  
#elif defined(INSTANCING)

	struct WORLD_TRANSFORM {
		float3 offset	: OFFSET;
		float4 quat		: BYTEDATA0;
		float4 userData_scale : BYTEDATA1;
   };   
   void TransformToWorldSpace(inout float3 vPos, inout float3 vNormal, inout float3 vTangent, in WORLD_TRANSFORM wtm) {
	   // Manual transposing done lead to additional instructions
	   float4 q = (wtm.quat - .5f) * 2.f;
	   // Need that normalize on CPU to make sure matrix is orthonormal
	   // (Havok is very sensitive to that)
	   // So need it on GPU as well to make the same output
	   q = normalize(q);
	   float3x3 tmRot = QuatToMatrix(q);

	   vPos = mul(vPos * UnpackScale(wtm.userData_scale.a), tmRot) + wtm.offset;
	   vNormal = mul(vNormal, tmRot);
	   vTangent = mul(vTangent, tmRot);
   }
   void TransformToWorldSpace(inout float3 vPos, in WORLD_TRANSFORM wtm) {
		float3 vNormal = _UP;
		float3 vTangent = float3(1.f,0,0);
		TransformToWorldSpace( vPos, vNormal, vTangent, wtm );
   }
#elif defined(WORLD_MATRIX)

	struct WORLD_TRANSFORM {};
	void TransformToWorldSpace(inout float3 vPos, inout float3 vNormal, inout float3 vTangent, in WORLD_TRANSFORM wtm) {
		float3x4 tmWorld = {
			TB_MATRICES[0],
			TB_MATRICES[1],
			TB_MATRICES[2]
		};
		vPos = mul(tmWorld, float4(vPos, 1)).xyz;
		vNormal = mul((float3x3)tmWorld, vNormal);		
		vTangent = mul((float3x3)tmWorld, vTangent);

		vNormal = normalize(vNormal);
		vTangent = normalize( vTangent );
	}
	void TransformToWorldSpace(inout float3 vPos, in WORLD_TRANSFORM wtm) {
		float3x4 tmWorld = {
			TB_MATRICES[0],
			TB_MATRICES[1],
			TB_MATRICES[2]
		};
		vPos = mul(tmWorld, float4(vPos, 1)).xyz;
	}
#else

	struct WORLD_TRANSFORM {};
	void TransformToWorldSpace(inout float3 vPos, inout float3 vNormal, inout float3 vTangent, in WORLD_TRANSFORM wtm) {}
	void TransformToWorldSpace(inout float3 vPos, in WORLD_TRANSFORM wtm) {}
#endif
//
// forward declaration
float GetParallaxHeight(in float2 tc, in float4 texGrad);

// [vStart] and [vFinish] must be in format:
// xyz = coordinates of the point on the ray (z is height)
// w   = height from heightfield below the [xyz] point
// ----------------------------------------------------------------------------

void ParallaxBinarySearch(inout float4 vStart, inout float4 vFinish, in float4 texGrad)
{
   const int NUM_ITERATIONS = 5;

   [unroll]
   for(int i = 0; i < NUM_ITERATIONS; i++) {
      float4 vMid;    
      // subdiv(vStart, vFinish)
      vMid.xyz = (vStart.xyz + vFinish.xyz) * .5f;
      vMid.w = GetParallaxHeight(vMid.xy, texGrad);
      // if (vMid.z >= vMid.w) vStart = vMid;
      // else vFinish = vMid;
      float factor = step(vMid.z, vMid.w);
      vStart = lerp(vStart,  vMid, factor);
      vFinish = lerp(vMid, vFinish, factor);
   }
}//
//--------------------------------------------------------------------------------------	

float2 CalcParallaxOffset(float2 texCoord, in float3 vertToEyeTS, in float scale, in float2 texCoordScale)
{
	float2 outOffset = 0;

	float4 texGrad;
	texGrad.xy = ddx(texCoord);
	texGrad.zw = ddy(texCoord);

	float2 vOffsetVector = normalize(vertToEyeTS).xy * texCoordScale;

	[branch]
	if (scale > 0) {
		vOffsetVector *= scale;

		const int NSAMPLES = 8;
		const float DSAMPLE = 1.h / float(NSAMPLES-1);
		float3 h[NSAMPLES];

		int ind = 0;

		[unroll]
		for (ind = 0; ind < NSAMPLES; ind++ ) {
			// "off" has to be float to avoid visual artefacts
			float2 off = texCoord - vOffsetVector * .5h + vOffsetVector * ind * DSAMPLE;
			h[ind].x = GetParallaxHeight(off, texGrad);
			h[ind].y = 0;
			h[ind].z = ind * DSAMPLE;
		}
		[unroll]
		for (ind = 0; ind < NSAMPLES-1; ind++ ) {
			// "off" has to be float to avoid visual artefacts
			float2 off = texCoord - vOffsetVector * .5h + vOffsetVector * ind * DSAMPLE;
			h[ind].y = h[ind+1].x;
		}

		float3 fi = h[0];
		[unroll]
		for (ind = 1; ind < NSAMPLES-1; ind++ ) {
			fi = (h[ind].x >= h[ind].z) ? h[ind] : fi;
		}
		#ifdef USE_PARALLAX_MAPPING_CHEAP
			// line segment intersection
			float x = fi.z;
			float y = x + DSAMPLE;
			float xh = fi.x;
			float yh = fi.y;
			float H = ( -DSAMPLE * yh - (xh-yh) * y ) / ( -DSAMPLE - (xh-yh) );
			outOffset = vOffsetVector * (H - .5h);
		#else
			float4 vStart, vFinish; 
			vStart.xy = texCoord - vOffsetVector * .5h + vOffsetVector * fi.z;
			vStart.z  = fi.z;
			vStart.w  = fi.x;

			vFinish.xy  = vStart.xy + vOffsetVector * DSAMPLE;
			vFinish.z   = vStart.z + DSAMPLE;
			vFinish.w   = fi.y;

			ParallaxBinarySearch(vStart, vFinish, texGrad);
			outOffset = vFinish.xy - texCoord;
		#endif
	} else {
		// Outside parallax radius - zero parallax offset, calculate just a shadow
		outOffset = 0;
	}
	return outOffset;
}//	
//-----------------------------------------------------------------------------

float4 SampleMirrored(in _texture2D tex, in float2 tQuad, in float2 tc, in float scale, in float delta) {
	float dx = 1.f - saturate(tQuad.x / delta);
	float dy = 1.f - saturate(tQuad.y / delta);
	float dd = dx * dy;

	float4 w;
	w.x = max(dx - dd, 0);
	w.y = max(dy - dd, 0);
	w.z = dd;
	w.w = max(1.f - w.x - w.y - w.z, 0);

	float4 mirrored =
		sample2D(tex, tc * scale) * w.w +
		sample2D(tex, tc * scale + float2(scale, 0)) * w.x +
		sample2D(tex, tc * scale + float2(0, scale)) * w.y +
		sample2D(tex, tc * scale + float2(scale, scale)) * w.z;
	return mirrored;
}
//
struct HS_DEFAULT_QUAD_CONSTANT_OUTPUT
{
	float Edges[4] : SV_TessFactor;
	float Inside[2] : SV_InsideTessFactor;
};
struct HS_DEFAULT_TRI_CONSTANT_OUTPUT
{
	float Edges[3] : SV_TessFactor;
	float Inside[1] : SV_InsideTessFactor;
};


#ifndef HS_DEFAULT_QUAD_PARTITIONING
#define HS_DEFAULT_QUAD_PARTITIONING "fractional_even"
#endif
#define HS_DEFAULT_QUAD_FUNCTION_BEGIN(OutputName, Name, ConstantFunction) \
	[domain("quad")] \
	[partitioning(HS_DEFAULT_QUAD_PARTITIONING)] \
	[outputtopology("triangle_cw")] \
	[outputcontrolpoints(4)] \
	[patchconstantfunc(#ConstantFunction)] \
	OutputName Name(InputPatch<OutputName, 4> ip, \
		uint i : SV_OutputControlPointID, \
		uint patchID : SV_PrimitiveID) \
	{ \
		OutputName Out;

#ifndef HS_DEFAULT_TRI_PARTITIONING
#define HS_DEFAULT_TRI_PARTITIONING "fractional_even"
#endif
#define HS_DEFAULT_TRI_FUNCTION_BEGIN(OutputName, Name, ConstantFunction) \
	[domain("tri")] \
	[partitioning(HS_DEFAULT_TRI_PARTITIONING)] \
	[outputtopology("triangle_cw")] \
	[outputcontrolpoints(3)] \
	[patchconstantfunc(#ConstantFunction)] \
	OutputName Name(InputPatch<OutputName, 3> ip, \
		uint i : SV_OutputControlPointID, \
		uint patchID : SV_PrimitiveID) \
	{ \
		OutputName Out;

#define DS_DEFAULT_QUAD_EVALUATE(Name) lerp(lerp(inputPatch[0].##Name, inputPatch[1].##Name, uv.x), lerp(inputPatch[3].##Name, inputPatch[2].##Name, uv.x), uv.y)
//#define DS_DEFAULT_TRI_EVALUATE(Name) lerp(lerp(inputPatch[0].##Name, inputPatch[1].##Name, uv.x), lerp(inputPatch[3].##Name, inputPatch[2].##Name, uv.x), uv.y)

#define HS_DEFAULT_PASSTHROUGH(Param) \
		Out.Param = ip[i].Param;

#define HS_DEFAULT_FUNCTION_END \
		return Out; \
	}

// Debug shader output
#define DO_DEBUG_SHADER_OUTPUT(albedo, metalness, roughness, occlusion, alpha) \
if (g_fShaderOutput == 1.f) { \
	return float4(albedo, alpha); \
} \
if (g_fShaderOutput == 2.f) { \
	return float4(metalness.xxx, alpha); \
} \
if (g_fShaderOutput == 3.f) { \
	return float4(roughness.xxx, alpha); \
} \
if (g_fShaderOutput == 4.f) { \
	return float4(occlusion.xxx, alpha); \
}

// Default VS
// SV_Position needs to be last!
void passThroughVS(in float4 vPos : POSITION,
	out float4 oProjPos : SV_Position)
{
	oProjPos = ScreenToProj(vPos);
}//	
//-----------------------------------------------------------------------------
void passThroughTexVS(in float4 vPos : POSITION,
	in float2 vTexCoord0 : TEXCOORD0,	
	out float2 tc : TEXCOORD0,
	out float4 oProjPos : SV_Position)
{	
	tc = vTexCoord0;
	oProjPos = ScreenToProj(vPos);
}//	
//-----------------------------------------------------------------------------
void passThroughTexTexVS(in float4 vPos : POSITION,
	in float2 vTexCoord0 : TEXCOORD0,
	in float2 vTexCoord1 : TEXCOORD1,
	out float2 tc0 : TEXCOORD0,
	out float2 tc1 : TEXCOORD1,
	out float4 oProjPos : SV_Position)
{
	tc0 = vTexCoord0;
	tc1 = vTexCoord1;
	oProjPos = ScreenToProj(vPos);
}//	
//-----------------------------------------------------------------------------
void passThroughColorVS(in float4 vPos : POSITION,
	in float4 vColor0 : COLOR0,
	out float4 c : COLOR0,
	out float4 oProjPos : SV_Position)
{	
	c = vColor0;
	oProjPos = ScreenToProj(vPos);
}//	
//-----------------------------------------------------------------------------
void passThroughColorTexVS(in float4 vPos : POSITION,
	in float4 vColor0 : COLOR0,
	in float2 vTexCoord0 : TEXCOORD0,
	out float4 c : COLOR0,
	out float2 tc : TEXCOORD0,
	out float4 oProjPos : SV_Position)
{
	c = vColor0;
	tc = vTexCoord0;
	oProjPos = ScreenToProj(vPos);
}//	
//-----------------------------------------------------------------------------
//void passThroughTex4ColorVS(in float4 vPos : POSITION,
//	in float4 vColor0 : COLOR0,
//	in float4 vTexCoord0 : TEXCOORD0,
//	out float4 c : COLOR0,
//	out float4 tc : TEXCOORD0,
//	out float4 oProjPos : SV_Position)
//{
//	oProjPos = ScreenToProj(vPos);
//	c = vColor0;
//	tc = vTexCoord0;
//}//	
////-----------------------------------------------------------------------------
#endif //__cplusplus

#endif
//EOF