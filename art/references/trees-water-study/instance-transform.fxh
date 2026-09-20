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
