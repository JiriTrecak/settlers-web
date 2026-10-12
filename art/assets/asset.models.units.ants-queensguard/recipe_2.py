import math
from mathutils import Quaternion,Matrix
from mathutils.kdtree import KDTree

def rigid(mesh,v,name):
 for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
 mesh.vertex_groups['mixamorig:'+name].add([v.index],1,'REPLACE')
equipment_vertices={'RightHand': [188, 241, 242, 243, 244, 366, 367, 391, 392, 414, 441, 442, 447, 456, 457, 476, 493, 495, 496, 497, 498, 499, 500, 501, 505, 508, 528, 529, 530, 531, 538, 539, 541, 542, 550, 552, 560, 561, 562, 566, 570, 571, 576, 577, 579, 580, 581, 590, 596, 597, 605, 616, 624, 643, 655, 662, 663, 665, 666, 674, 675, 677, 678, 679, 697, 702, 703, 705, 706, 721, 734, 736, 739, 743, 748, 749, 758, 759, 760, 761, 764, 771, 772, 773, 777, 778, 779, 783, 787, 789, 795, 802, 803, 821, 823, 824, 826, 831, 832, 833, 835, 836, 849, 850, 851, 852, 858, 864, 865, 868, 869, 875, 876, 885, 891, 892, 895, 896, 905, 906, 909, 910, 911, 922, 923, 925, 926, 927, 929, 932, 934, 935, 944, 948, 949, 952, 955, 957, 965, 966, 967, 968, 969, 973, 974, 975, 981, 986, 991, 993, 1000, 1003, 1012, 1013, 1017, 1026, 1029, 1030, 1036, 1037, 1044, 1061, 1086, 1087, 1090, 1091, 1092, 1107, 1108, 1117, 1118, 1121, 1123, 1124, 1140, 1152, 1165, 1166, 1167, 1168, 1172, 1176, 1177, 1178, 1179, 1180, 1189, 1190, 1193, 1194, 1195, 1200, 1201, 1202, 1203, 1208, 1211, 1217, 1224, 1229, 1230, 1232, 1233, 1235, 1240, 1242, 1244, 1251, 1252, 1254, 1255, 1261, 1262, 1263, 1264, 1265, 1272, 1273, 1277, 1278, 1279, 1280, 1282, 1283, 1295, 1299, 1308, 1309, 1314, 1315, 1323, 1324, 1325, 1329, 1330, 1335, 1336, 1340, 1341, 1342, 1343, 1344, 1351, 1352, 1353, 1354, 1355, 1356, 1362, 1363, 1364, 1367, 1369, 1370, 1388, 1389, 1390, 1395, 1396, 1397, 1398, 1412, 1413, 1420, 1421, 1425, 1429, 1430, 1435, 1441, 1442, 1462, 1476, 1477, 1487, 1488, 1506, 1513, 1514, 1545, 1546, 1551, 1561, 1583, 1584, 1588, 1620, 1646, 1647, 1663, 1664, 1665, 1697, 1703, 1710, 1728, 1729, 1807, 1808, 1833, 1842, 1843, 1850, 1851], 'LeftHand': [89, 92, 98, 121, 146, 163, 167, 169, 170, 200, 217, 229, 247, 248, 251, 256, 259, 265, 293, 319, 320, 331, 363, 364, 373, 374, 375, 376, 380, 381, 385, 393, 394, 400, 421, 424, 425, 426, 427, 429, 430, 431, 443, 444, 453, 454, 455, 459, 465, 466, 467, 468, 469, 490, 509, 510, 516, 526, 534, 545, 547, 557, 574, 575, 585, 586, 593, 594, 601, 602, 603, 606, 617, 625, 626, 631, 636, 656, 664, 667, 682, 683, 689, 690, 691, 707, 708, 715, 716, 718, 719, 726, 727, 728, 732, 733, 742, 745, 753, 754, 762, 775, 776, 780, 781, 782, 790, 798, 804, 805, 806, 811, 815, 820, 825, 829, 834, 838, 853, 857, 862, 863, 877, 882, 888, 894, 897, 908, 912, 913, 915, 920, 921, 930, 933, 936, 945, 950, 951, 954, 956, 958, 963, 971, 972, 978, 980, 982, 983, 994, 1002, 1005, 1008, 1009, 1014, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1033, 1038, 1039, 1041, 1043, 1048, 1054, 1056, 1062, 1070, 1072, 1073, 1074, 1075, 1076, 1079, 1080, 1081, 1088, 1089, 1093, 1095, 1097, 1098, 1099, 1103, 1105, 1106, 1111, 1115, 1116, 1119, 1122, 1127, 1128, 1129, 1136, 1137, 1138, 1139, 1142, 1145, 1146, 1147, 1148, 1149, 1150, 1153, 1156, 1158, 1160, 1161, 1162, 1163, 1164, 1169, 1170, 1171, 1173, 1181, 1186, 1191, 1192, 1196, 1197, 1199, 1204, 1206, 1212, 1213, 1214, 1215, 1216, 1220, 1222, 1223, 1225, 1226, 1227, 1234, 1237, 1241, 1245, 1246, 1253, 1256, 1258, 1259, 1266, 1267, 1268, 1269, 1270, 1274, 1275, 1284, 1285, 1287, 1288, 1289, 1290, 1291, 1292, 1293, 1294, 1297, 1298, 1300, 1301, 1302, 1303, 1304, 1305, 1306, 1307, 1311, 1312, 1313, 1317, 1318, 1320, 1321, 1322, 1326, 1327, 1328, 1331, 1332, 1337, 1338, 1339, 1345, 1346, 1347, 1348, 1349, 1350, 1357, 1358, 1359, 1360, 1366, 1368, 1371, 1372, 1373, 1374, 1375, 1376, 1377, 1378, 1379, 1380, 1381, 1382, 1383, 1386, 1387, 1391, 1392, 1393, 1394, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1414, 1415, 1416, 1423, 1424, 1426, 1427, 1428, 1431, 1432, 1433, 1434, 1436, 1438, 1439, 1440, 1443, 1445, 1446, 1447, 1448, 1449, 1450, 1451, 1452, 1454, 1455, 1456, 1457, 1458, 1459, 1460, 1461, 1463, 1464, 1465, 1466, 1469, 1470, 1471, 1473, 1474, 1475, 1478, 1481, 1482, 1484, 1485, 1486, 1490, 1491, 1492, 1493, 1494, 1495, 1496, 1497, 1498, 1499, 1500, 1502, 1503, 1505, 1507, 1508, 1509, 1510, 1512, 1516, 1519, 1520, 1522, 1523, 1524, 1525, 1526, 1527, 1528, 1529, 1530, 1531, 1538, 1539, 1540, 1543, 1544, 1552, 1554, 1555, 1556, 1558, 1559, 1560, 1562, 1563, 1564, 1565, 1566, 1567, 1568, 1569, 1570, 1571, 1572, 1573, 1574, 1575, 1576, 1577, 1578, 1579, 1581, 1582, 1585, 1586, 1587, 1592, 1593, 1594, 1595, 1596, 1597, 1599, 1600, 1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609, 1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1621, 1622, 1623, 1624, 1625, 1626, 1627, 1628, 1629, 1630, 1631, 1632, 1633, 1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641, 1642, 1643, 1644, 1645, 1648, 1649, 1650, 1651, 1652, 1653, 1654, 1655, 1656, 1657, 1658, 1659, 1662, 1666, 1667, 1668, 1669, 1672, 1673, 1674, 1675, 1676, 1677, 1678, 1679, 1680, 1681, 1682, 1683, 1684, 1685, 1686, 1687, 1688, 1689, 1690, 1691, 1692, 1693, 1694, 1695, 1696, 1698, 1699, 1700, 1701, 1702, 1705, 1706, 1707, 1708, 1709, 1711, 1712, 1713, 1714, 1715, 1716, 1717, 1718, 1719, 1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727, 1730, 1731, 1732, 1734, 1735, 1736, 1737, 1738, 1739, 1740, 1741, 1742, 1743, 1744, 1745, 1746, 1747, 1748, 1749, 1750, 1751, 1752, 1753, 1754, 1755, 1756, 1759, 1760, 1761, 1762, 1763, 1764, 1765, 1766, 1767, 1768, 1769, 1770, 1771, 1772, 1773, 1774, 1775, 1776, 1777, 1778, 1779, 1780, 1781, 1782, 1783, 1785, 1786, 1787, 1788, 1789, 1790, 1791, 1793, 1794, 1795, 1796, 1797, 1798, 1799, 1801, 1802, 1803, 1804, 1805, 1806, 1809, 1810, 1811, 1812, 1813, 1814, 1815, 1816, 1817, 1818, 1819, 1820, 1821, 1822, 1823, 1824, 1825, 1826, 1827, 1828, 1829, 1830, 1831, 1832, 1834, 1835, 1836, 1837, 1838, 1839, 1840, 1841, 1844, 1845, 1846, 1847, 1852, 1853, 1854, 1855, 1857, 1858, 1859, 1860, 1861, 1862, 1863, 1864, 1865, 1866, 1867, 1868, 1869, 1870, 1871, 1872, 1874, 1875, 1876, 1877, 1878, 1879, 1880, 1881, 1882, 1883, 1884, 1885, 1886, 1887, 1888, 1889, 1890, 1891, 1892, 1893, 1894, 1895, 1896, 1897, 1898, 1899, 1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908, 1909, 1910, 1911, 1912, 1913, 1914, 1915, 1916, 1917, 1918, 1919, 1922, 1923, 1924, 1927, 1928, 1929, 1930, 1931, 1932, 1933, 1934, 1935, 1936, 1939, 1940, 1941, 1942, 1945, 1947, 1948, 1949, 1951, 1954, 1955, 1964, 1997, 2002, 2023, 2024, 2039, 2070, 2074, 2075, 2089, 2102, 2126, 2140, 2179]}
for mesh in meshes:
 im=mesh.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
 pixels=np.asarray(im.pixels[:]).reshape(im.size[1],im.size[0],4);colours={}
 for loop in mesh.data.loops:
  u,v=mesh.data.uv_layers.active.data[loop.index].uv;colours[loop.vertex_index]=pixels[min(im.size[1]-1,int(v*im.size[1])),min(im.size[0]-1,int(u*im.size[0])),:3]
 valid=[]
 for v in mesh.data.vertices:
  weights=[(g.group,g.weight)for g in v.groups if mesh.vertex_groups[g.group].name.startswith('mixamorig:') and g.weight>0]
  if weights:valid.append((v.index,weights))
 tree=KDTree(len(valid));lookup=dict(valid)
 for i,_ in valid:tree.insert(mesh.data.vertices[i].co,i)
 tree.balance()
 for v in mesh.data.vertices:
  weights=lookup.get(v.index) or lookup[tree.find(v.co)[1]]
  for g in [g.group for g in v.groups]:mesh.vertex_groups[g].remove([v.index])
  total=sum(w for _,w in weights)
  for g,w in weights:mesh.vertex_groups[g].add([v.index],w/total,'REPLACE')
  x,y,z=v.co
  # Rigid pole and blade outside the right arm; tower shield in front of left arm.
  if v.index in equipment_vertices['RightHand']:rigid(mesh,v,'RightHand')
  elif v.index in equipment_vertices['LeftHand']:rigid(mesh,v,'LeftHand')
  elif z>.69:rigid(mesh,v,'Head')

def activate(a):rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
for a in list(bpy.data.actions):
 activate(a);samples=[]
 for frame in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
  scene.frame_set(frame);poses={}
  for b in rig.pose.bones:
   name=b.name.split(':')[-1]
   if any(x in name for x in ['Hand','Arm','Shoulder','Head','Neck','Spine']):
    retain=0 if any(x in name for x in ['Hand','Arm','Shoulder']) else .10
    poses[b.name]=Quaternion().slerp(b.rotation_quaternion,retain)
  samples.append((frame,poses))
 for frame,poses in samples:
  for name,q in poses.items():b=rig.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame)
for name in ['idle','attack','hit']:bpy.data.actions.remove(bpy.data.actions[name])
def keypose(frame):
 for b in rig.pose.bones:
  b.keyframe_insert('location',frame=frame);b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('scale',frame=frame)
def rotate(name,axis,angle):
 bpy.context.view_layer.update();b=rig.pose.bones['mixamorig:'+name];pivot=b.head.copy()
 b.matrix=Matrix.Translation(pivot)@Quaternion(axis,angle).to_matrix().to_4x4()@Matrix.Translation(-pivot)@b.matrix
# Deliberate polearm chop: short windup, decisive forward contact, recovery.
def curve(frame,keys):
 for (a,x),(b,y) in zip(keys,keys[1:]):
  if a<=frame<=b:
   t=(frame-a)/(b-a);return x+(y-x)*(t*t*(3-2*t))
 return keys[-1][1]
for name,end in [('idle',96),('hit',24),('attack',44),('cast',40)]:
 a=bpy.data.actions.new(name);a.use_fake_user=True;rig.animation_data.action=a
 for frame in range(end+1):
  for b in rig.pose.bones:b.matrix_basis.identity()
  t=frame/end
  if name=='idle':rotate('Spine',(1,0,0),math.sin(t*math.tau)*.008)
  elif name=='hit':rotate('Spine',(1,0,0),-.08*math.sin(math.pi*t))
  elif name=='attack':
   swing=curve(frame,[(0,0),(9,-.22),(15,-.22),(21,1.0),(26,1.0),(44,0)])
   rotate('RightArm',(1,0,0),swing*.55);rotate('RightForeArm',(1,0,0),swing*.3);rotate('RightHand',(1,0,0),swing*.15)
   rotate('Spine',(0,0,1),swing*.08)
  else:
   # Brace behind the shield, then relax; no spellcasting wand gesture.
   strength=math.sin(math.pi*t)**2;rotate('LeftArm',(1,0,0),-.12*strength);rotate('Spine',(1,0,0),.07*strength)
  keypose(frame)
(work/'motion-events.json').write_text(json.dumps({'attack':{'time':21/24,'contact':21/44},'cast':{'time':20/24,'contact':.5}},indent=2))
