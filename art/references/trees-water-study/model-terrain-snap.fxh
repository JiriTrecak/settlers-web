float h = GetTerrainHeight(worldPos.xz);
			//#ifdef IS_TRANSPARENT
			//	// snap underlay
			//	worldPos.y = h + .05f;
			//#else
				float t = saturate((v.vPos.y - 2.f) / 2.f);
				//#if !defined(SKINNING)
				//	float3 worldPivot = float3(0, 0, 0);
				//	TransformToWorldSpace(worldPivot, v.wtm);

				//	// relative to frame origin
				//	worldPos.y = lerp(h + (worldPos.y - worldPivot.y), worldPos.y, t);
				//#else
					// cant detect pivot when using skinnig
					worldPos.y = lerp(h + v.vPos.y, worldPos.y, t);
				//#endif	
			//#endif
		}